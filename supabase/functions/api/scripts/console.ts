// Consola de administración: cuentas de usuario y semillas de desarrollo.
//   deno task console app:user:create email@club.es 'Nombre Apellidos' superadministrator|administrator|teacher|assistant
//   deno task console app:user:reset-password email@club.es
//   deno task console app:user:disable|enable email@club.es
//   deno task console app:user:role email@club.es teacher
//   deno task console app:dev:seed-users          (solo desarrollo: usuarios con contraseñas conocidas)
//   deno task console app:dev:seed-demo [--reset]  (solo desarrollo: datos ficticios del diseño)
//   deno task console app:billing:generate-charges [--month=AAAA-MM]
// Se conecta con DATABASE_URL (en local, el PostgreSQL de Compose; en producción, el pooler de Supabase).
import { EmailAddress, FullName, InvalidValue } from '../src/domain/common/mod.ts';
import { PlainPassword, type Role, User, UserId } from '../src/domain/identity/mod.ts';
import {
  ChangeUserRole,
  DisableUser,
  EmailAlreadyRegistered,
  EnableUser,
  RegisterUser,
  ResetUserPassword,
  UserNotFound,
} from '../src/application/identity/mod.ts';
import { configFromEnv } from '../src/container.ts';
import { AuditedSecurityEventLog } from '../src/infrastructure/audit/mod.ts';
import {
  BcryptPasswordHasher,
  RandomTemporaryPasswordGenerator,
} from '../src/infrastructure/identity/security.ts';
import { Logger } from '../src/infrastructure/logging/mod.ts';
import {
  SqlLoginAttemptLimiter,
  SqlSessionRepository,
  SqlUserRepository,
} from '../src/infrastructure/persistence/identity.ts';
import {
  createDb,
  inTransaction,
  type Sql,
  type TransactionSql,
} from '../src/infrastructure/persistence/sql.ts';
import { generateCharges, seedDemoData } from './demo-data.ts';

/** email => [nombre, rol, contraseña, debe cambiarla]. SOLO para desarrollo y tests. */
export const DEVELOPMENT_USERS: Record<string, [string, Role, string, boolean]> = {
  'admin@puertaelvira.test': [
    'Administración Pruebas',
    'superadministrator',
    'desarrollo-admin',
    false,
  ],
  'junta@puertaelvira.test': ['Junta Pruebas', 'administrator', 'desarrollo-junta', false],
  'profe@puertaelvira.test': ['Profesora Pruebas', 'teacher', 'desarrollo-profe', false],
  'nuevo@puertaelvira.test': ['Cuenta Nueva Pruebas', 'administrator', 'desarrollo-nuevo', true],
  'ia@puertaelvira.test': ['Asistente IA Pruebas', 'assistant', 'desarrollo-ia', false],
};

function showTemporary(temporary: string): void {
  console.log(`Contraseña temporal: ${temporary}`);
  console.log('Se muestra solo esta vez. Entrégala en persona; habrá que cambiarla al entrar.');
}

export async function runCommand(
  sql: TransactionSql,
  hashCost: number,
  [command, ...args]: string[],
): Promise<number> {
  const users = new SqlUserRepository(sql);
  const sessions = new SqlSessionRepository(sql);
  const hasher = new BcryptPasswordHasher(hashCost);
  const log = new AuditedSecurityEventLog(new Logger({ channel: 'console' }), sql);
  const clock = { now: () => new Date() };
  const temporaryPasswords = new RandomTemporaryPasswordGenerator();
  const arg = (index: number, name: string) => {
    const value = args[index];
    if (!value) throw new InvalidValue(name, `Falta el argumento ${name}.`);
    return value;
  };
  try {
    switch (command) {
      case 'app:user:create': {
        const temporary = await new RegisterUser(users, hasher, temporaryPasswords, log, clock)
          .execute(arg(0, 'email'), arg(1, 'nombre'), arg(2, 'rol'));
        console.log('Cuenta creada.');
        showTemporary(temporary);
        return 0;
      }
      case 'app:user:reset-password': {
        const temporary = await new ResetUserPassword(
          users,
          sessions,
          hasher,
          temporaryPasswords,
          log,
          clock,
        )
          .execute(arg(0, 'email'));
        console.log('Contraseña restablecida; las sesiones se han cerrado.');
        showTemporary(temporary);
        return 0;
      }
      case 'app:user:disable':
        await new DisableUser(users, sessions, log).execute(arg(0, 'email'));
        console.log('Cuenta desactivada; las sesiones se han cerrado.');
        return 0;
      case 'app:user:enable':
        await new EnableUser(users, log).execute(arg(0, 'email'));
        console.log('Cuenta activada.');
        return 0;
      case 'app:user:role':
        await new ChangeUserRole(users, log).execute(arg(0, 'email'), arg(1, 'rol'));
        console.log('Rol cambiado.');
        return 0;
      case 'app:dev:seed-users':
        await seedDevelopmentUsers(sql, hasher, clock.now());
        return 0;
      case 'app:dev:seed-demo':
        console.log(await seedDemoData(sql, clock, args.includes('--reset')));
        return 0;
      case 'app:billing:generate-charges': {
        const month = args.find((a) => a.startsWith('--month='))?.slice('--month='.length) ?? null;
        console.log(await generateCharges(sql, clock, month));
        return 0;
      }
      default:
        console.error(`Comando desconocido: ${command ?? '(ninguno)'}`);
        return 2;
    }
  } catch (error) {
    if (
      error instanceof EmailAlreadyRegistered || error instanceof UserNotFound ||
      error instanceof InvalidValue
    ) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

/** Usuarios con contraseñas conocidas y reinicio de los contadores de intentos. Nunca en producción. */
async function seedDevelopmentUsers(
  sql: Sql,
  hasher: BcryptPasswordHasher,
  now: Date,
): Promise<void> {
  const users = new SqlUserRepository(sql);
  for (const [email, [name, role, password, mustChange]] of Object.entries(DEVELOPMENT_USERS)) {
    const hash = await hasher.hash(PlainPassword.fromString(password));
    const user = await users.findByEmail(EmailAddress.fromString(email)) ??
      User.register(
        UserId.generate(),
        EmailAddress.fromString(email),
        FullName.fromString(name),
        role,
        hash,
        now,
      );
    if (mustChange) user.resetPassword(hash, now);
    else user.changePassword(hash, now);
    // Las cuentas de prueba siempre quedan con el rol de la lista (p. ej. al pasar admin a superadministración).
    user.changeRole(role);
    user.enable();
    await users.save(user);
    console.log(`${email}\t${role}\t${password}\t${mustChange ? 'debe cambiarla' : ''}`);
  }
  await new SqlLoginAttemptLimiter(sql).clear();
}

if (import.meta.main) {
  const config = configFromEnv();
  const db = createDb(config.databaseUrl, { max: 1 });
  const code = await inTransaction(db, (tx) => runCommand(tx, config.passwordHashCost, Deno.args));
  await db.end();
  Deno.exit(code);
}

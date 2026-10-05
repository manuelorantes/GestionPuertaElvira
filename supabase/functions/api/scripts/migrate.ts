// Aplica las migraciones SQL de supabase/migrations que falten en la base de datos.
//   deno task migrate            (DATABASE_URL)
//   deno task migrate --test     (TEST_DATABASE_URL)
// Crea la base de datos si no existe y lleva el mismo registro que la CLI de Supabase
// (supabase_migrations.schema_migrations), así en producción `supabase db push` continúa desde el
// mismo punto. Una base creada con las antiguas migraciones de Doctrine adopta la migración inicial
// sin volver a ejecutarla.
import postgres from 'postgres';

const MIGRATIONS_DIR = new URL('../../../migrations/', import.meta.url);

interface Migration {
  version: string;
  name: string;
  file: string;
}

async function listMigrations(): Promise<Migration[]> {
  const migrations: Migration[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
    const match = /^(\d+)_(.+)\.sql$/.exec(entry.name);
    if (entry.isFile && match) {
      migrations.push({ version: match[1] ?? '', name: match[2] ?? '', file: entry.name });
    }
  }
  return migrations.sort((a, b) => a.version.localeCompare(b.version));
}

async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const sql = postgres(admin.toString(), { max: 1, prepare: false });
  try {
    if ((await sql`SELECT 1 FROM pg_database WHERE datname = ${name}`).length === 0) {
      await sql.unsafe(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
      console.log(`Base de datos ${name} creada.`);
    }
  } finally {
    await sql.end();
  }
}

export async function migrate(url: string): Promise<void> {
  await ensureDatabase(url);
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS supabase_migrations;
      CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
        version text PRIMARY KEY, statements text[], name text)`);
    const applied = new Set(
      (await sql`SELECT version FROM supabase_migrations.schema_migrations`).map((r) =>
        String(r.version)
      ),
    );
    const migrations = await listMigrations();
    const first = migrations[0];
    if (
      applied.size === 0 && first &&
      (await sql`SELECT to_regclass('public.audit_action') AS t`)[0]?.t
    ) {
      // Esquema creado por las migraciones de Doctrine: la migración inicial ya está aplicada.
      await sql`DROP TABLE IF EXISTS doctrine_migration_versions, cache_items`;
      await sql`INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
        VALUES (${first.version}, ${first.name}, ${[]})`;
      applied.add(first.version);
      console.log(`${first.file}: esquema ya presente, se registra como aplicada.`);
    }
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      const content = await Deno.readTextFile(new URL(migration.file, MIGRATIONS_DIR));
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
          VALUES (${migration.version}, ${migration.name}, ${[content]})`;
      });
      console.log(`${migration.file}: aplicada.`);
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  const variable = Deno.args.includes('--test') ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  const url = Deno.env.get(variable);
  if (!url) {
    console.error(`Falta ${variable}.`);
    Deno.exit(2);
  }
  await migrate(url);
}

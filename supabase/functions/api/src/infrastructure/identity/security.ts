import { createHash } from 'node:crypto';

import { argon2Verify, bcrypt, bcryptVerify } from 'hash-wasm';

import { PasswordHash, PlainPassword, SessionTokenHash } from '../../domain/identity/mod.ts';
import {
  type PasswordHasher,
  SessionToken,
  type SessionTokenGenerator,
  type TemporaryPasswordGenerator,
} from '../../application/identity/mod.ts';

/**
 * bcrypt (WASM, válido en el runtime de borde) sobre el SHA-256 de la contraseña, para que no haya
 * límite de 72 bytes. Los hashes argon2id de la etapa PHP se verifican y se migran al iniciar sesión.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly cost = 10) {}

  async hash(password: PlainPassword): Promise<PasswordHash> {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    return new PasswordHash(
      await bcrypt({
        password: prehash(password),
        salt,
        costFactor: this.cost,
        outputType: 'encoded',
      }),
    );
  }

  async verify(hash: PasswordHash, password: PlainPassword): Promise<boolean> {
    try {
      if (hash.value.startsWith('$argon2')) {
        return await argon2Verify({ password: password.reveal(), hash: hash.value });
      }
      return await bcryptVerify({ password: prehash(password), hash: hash.value });
    } catch {
      // Un hash con formato desconocido nunca coincide.
      return false;
    }
  }

  needsRehash(hash: PasswordHash): boolean {
    return !hash.value.startsWith(`$2a$${String(this.cost).padStart(2, '0')}$`);
  }
}

function prehash(password: PlainPassword): string {
  return createHash('sha256').update(password.reveal()).digest('hex');
}

/** 256 bits aleatorios en base64url; en base de datos solo se guarda su SHA-256. */
export class RandomSessionTokenGenerator implements SessionTokenGenerator {
  generate(): SessionToken {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return new SessionToken(
      btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(
        /=+$/,
        '',
      ),
    );
  }

  hash(token: SessionToken): SessionTokenHash {
    return new SessionTokenHash(createHash('sha256').update(token.value).digest('hex'));
  }
}

/** Contraseñas temporales fáciles de dictar: 4 grupos de 4 caracteres sin ambigüedades (sin i, l, o, 0, 1). */
export class RandomTemporaryPasswordGenerator implements TemporaryPasswordGenerator {
  private static readonly ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

  generate(): PlainPassword {
    const random = new Uint32Array(16);
    crypto.getRandomValues(random);
    const chars = [...random].map((n) =>
      RandomTemporaryPasswordGenerator
        .ALPHABET[n % RandomTemporaryPasswordGenerator.ALPHABET.length]
    );
    const groups = [0, 4, 8, 12].map((start) => chars.slice(start, start + 4).join(''));
    return PlainPassword.fromString(groups.join('-'));
  }
}

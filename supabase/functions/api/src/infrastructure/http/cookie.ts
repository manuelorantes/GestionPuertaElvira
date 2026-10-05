import type { Context } from '@hono/hono';
import { deleteCookie, getCookie, setCookie } from '@hono/hono/cookie';

/**
 * Cookie de sesión: HttpOnly, SameSite=Strict, Path=/ y, en producción, __Host- con Secure.
 */
export class SessionCookie {
  constructor(
    readonly name: string,
    private readonly secure: boolean,
  ) {}

  read(c: Context): string | null {
    const value = getCookie(c, this.name);
    return typeof value === 'string' && value !== '' ? value : null;
  }

  attach(c: Context, token: string): void {
    setCookie(c, this.name, token, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/',
      secure: this.secure,
    });
  }

  clear(c: Context): void {
    deleteCookie(c, this.name, { path: '/', secure: this.secure });
  }
}

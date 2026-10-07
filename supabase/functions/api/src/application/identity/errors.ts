export class CurrentPasswordMismatch extends Error {
  constructor() {
    super('La contraseña actual no es correcta.');
    this.name = 'CurrentPasswordMismatch';
  }
}

export class EmailAlreadyRegistered extends Error {
  constructor() {
    super('Ya existe una cuenta con ese email.');
    this.name = 'EmailAlreadyRegistered';
  }
}

/** Email desconocido, contraseña incorrecta o cuenta desactivada: se informa igual en los tres casos. */
export class InvalidCredentials extends Error {
  constructor() {
    super('Email o contraseña incorrectos.');
    this.name = 'InvalidCredentials';
  }
}

export class SessionNotValid extends Error {
  constructor() {
    super('La sesión no es válida o ha caducado.');
    this.name = 'SessionNotValid';
  }
}

export class TooManyLoginAttempts extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Demasiados intentos. Prueba más tarde.');
    this.name = 'TooManyLoginAttempts';
  }
}

export class UserNotFound extends Error {
  constructor() {
    super('No existe ninguna cuenta con ese email.');
    this.name = 'UserNotFound';
  }
}

/** Quien administra no puede desactivar su propia cuenta ni quitarse el rol (se quedaría fuera). */
export class CannotChangeOwnAccount extends Error {
  constructor() {
    super('No puedes desactivar tu propia cuenta ni cambiar tu propio rol.');
    this.name = 'CannotChangeOwnAccount';
  }
}

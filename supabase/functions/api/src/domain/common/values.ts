import { InvalidValue } from './errors.ts';

export class EmailAddress {
  private static readonly MAX_LENGTH = 254;

  private constructor(readonly value: string) {}

  static fromString(email: string): EmailAddress {
    const normalised = email.trim().toLowerCase();
    if (
      normalised.length > EmailAddress.MAX_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalised)
    ) {
      throw new InvalidValue('email', 'El email no tiene un formato válido.');
    }
    return new EmailAddress(normalised);
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }
}

export class FullName {
  private static readonly MIN_LENGTH = 2;
  private static readonly MAX_LENGTH = 120;

  private constructor(readonly value: string) {}

  static fromString(name: string): FullName {
    const normalised = name.replace(/\s+/gu, ' ').trim();
    const length = [...normalised].length;
    if (length < FullName.MIN_LENGTH || length > FullName.MAX_LENGTH) {
      throw new InvalidValue('fullName', 'El nombre debe tener entre 2 y 120 caracteres.');
    }
    return new FullName(normalised);
  }
}

/**
 * Teléfono español (fijo o móvil): 9 dígitos que empiezan por 6, 7, 8 o 9; prefijo +34 opcional.
 */
export class PhoneNumber {
  private constructor(readonly value: string) {}

  static fromString(phone: string): PhoneNumber {
    const digits = phone.replace(/[\s\-().]/g, '').replace(/^(\+34|0034)/, '');
    if (!/^[6-9]\d{8}$/.test(digits)) {
      throw new InvalidValue('phone', 'El teléfono debe ser un número español de 9 cifras.');
    }
    return new PhoneNumber(
      `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`,
    );
  }
}

/** Redondeo al entero más cercano con la mitad hacia fuera de cero (como `round()` en PHP). */
export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Importe en euros guardado en céntimos (enteros) para evitar errores de redondeo.
 */
export class Money {
  private constructor(readonly cents: number) {}

  static cents(cents: number): Money {
    return new Money(cents);
  }

  static euros(euros: number): Money {
    return new Money(euros * 100);
  }

  static zero(): Money {
    return new Money(0);
  }

  /** Acepta «30», «30,5» o «30.50». */
  static fromDecimal(value: string): Money {
    const normalised = value.trim().replace(',', '.');
    if (!/^-?\d+(\.\d{1,2})?$/.test(normalised)) {
      throw new InvalidValue('amount', 'El importe no es válido.');
    }
    return new Money(roundHalfAwayFromZero(Number(normalised) * 100));
  }

  plus(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  minus(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  times(factor: number): Money {
    return new Money(roundHalfAwayFromZero(this.cents * factor));
  }

  /** Porcentaje del importe, redondeado al céntimo (mitad hacia arriba). */
  percent(percentage: number): Money {
    return new Money(roundHalfAwayFromZero((this.cents * percentage) / 100));
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  format(): string {
    const absolute = Math.abs(this.cents);
    const decimals = absolute % 100 === 0 ? 0 : 2;
    const [whole = '0', fraction = ''] = (absolute / 100).toFixed(decimals).split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${this.cents < 0 ? '−' : ''}${grouped}${fraction ? `,${fraction}` : ''} €`;
  }
}

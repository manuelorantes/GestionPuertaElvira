import { type FullName, InvalidValue, Money, Uuid } from '../common/mod.ts';

export class TeacherId extends Uuid {}

/** Profesor del club: nombre, si está activo y lo que el club le paga por hora impartida. */
export class Teacher {
  static readonly DEFAULT_HOURLY_RATE_EUROS = 15;

  private constructor(
    readonly id: TeacherId,
    private name: FullName,
    private active: boolean,
    private rate: Money,
  ) {}

  static register(id: TeacherId, fullName: FullName): Teacher {
    return new Teacher(id, fullName, true, Money.euros(Teacher.DEFAULT_HOURLY_RATE_EUROS));
  }

  static restore(id: TeacherId, fullName: FullName, active: boolean, hourlyRate: Money): Teacher {
    return new Teacher(id, fullName, active, hourlyRate);
  }

  changeRate(hourlyRate: Money): void {
    if (hourlyRate.isNegative()) {
      throw new InvalidValue('hourlyRate', 'La tarifa por hora no puede ser negativa.');
    }
    this.rate = hourlyRate;
  }

  rename(fullName: FullName): void {
    this.name = fullName;
  }

  activate(): void {
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
  }

  fullName(): FullName {
    return this.name;
  }

  isActive(): boolean {
    return this.active;
  }

  hourlyRate(): Money {
    return this.rate;
  }
}

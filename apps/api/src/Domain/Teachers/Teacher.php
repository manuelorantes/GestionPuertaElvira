<?php

declare(strict_types=1);

namespace App\Domain\Teachers;

use App\Domain\Common\FullName;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\Money;

/**
 * Profesor del club. La especificación de Profesorado añadirá tarifa y horas.
 */
final class Teacher
{
    public const int DEFAULT_HOURLY_RATE_EUROS = 15;

    private function __construct(
        private readonly TeacherId $id,
        private FullName $fullName,
        private bool $active,
        private Money $hourlyRate,
    ) {
    }

    public static function register(TeacherId $id, FullName $fullName): self
    {
        return new self($id, $fullName, true, Money::euros(self::DEFAULT_HOURLY_RATE_EUROS));
    }

    public static function restore(TeacherId $id, FullName $fullName, bool $active, Money $hourlyRate): self
    {
        return new self($id, $fullName, $active, $hourlyRate);
    }

    /** Lo que el club le paga por hora impartida. */
    public function changeRate(Money $hourlyRate): void
    {
        if ($hourlyRate->isNegative()) {
            throw new InvalidValue('hourlyRate', 'La tarifa por hora no puede ser negativa.');
        }
        $this->hourlyRate = $hourlyRate;
    }

    public function hourlyRate(): Money
    {
        return $this->hourlyRate;
    }

    public function rename(FullName $fullName): void
    {
        $this->fullName = $fullName;
    }

    public function activate(): void
    {
        $this->active = true;
    }

    public function deactivate(): void
    {
        $this->active = false;
    }

    public function id(): TeacherId
    {
        return $this->id;
    }

    public function fullName(): FullName
    {
        return $this->fullName;
    }

    public function isActive(): bool
    {
        return $this->active;
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Common\InvalidValue;
use App\Domain\Common\Money;

/** Datos de facturación del alumno: preferencia de pago, socio, precio de particulares y puntos. */
final class StudentAccount
{
    private function __construct(
        private readonly StudentRef $student,
        private PreferredPlan $preferredPlan,
        private bool $member,
        private ?Money $privateRate,
        private int $points,
    ) {
    }

    public static function open(StudentRef $student): self
    {
        return new self($student, PreferredPlan::Monthly, false, null, 0);
    }

    public static function restore(StudentRef $student, PreferredPlan $plan, bool $member, ?Money $privateRate, int $points): self
    {
        return new self($student, $plan, $member, $privateRate, $points);
    }

    public function update(PreferredPlan $plan, bool $member, ?Money $privateRate): void
    {
        if (null !== $privateRate && $privateRate->isNegative()) {
            throw new InvalidValue('privateRate', 'El precio por hora no puede ser negativo.');
        }
        $this->preferredPlan = $plan;
        $this->member = $member;
        $this->privateRate = $privateRate;
    }

    public function adjustPoints(int $delta): void
    {
        if ($this->points + $delta < 0) {
            throw new InvalidValue('points', 'Los puntos no pueden quedar en negativo.');
        }
        $this->points += $delta;
    }

    public function student(): StudentRef
    {
        return $this->student;
    }

    public function preferredPlan(): PreferredPlan
    {
        return $this->preferredPlan;
    }

    public function isMember(): bool
    {
        return $this->member;
    }

    public function privateRate(): ?Money
    {
        return $this->privateRate;
    }

    public function points(): int
    {
        return $this->points;
    }
}

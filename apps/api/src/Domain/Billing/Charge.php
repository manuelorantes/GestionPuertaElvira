<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Billing\Error\ChargeAlreadyPaid;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use App\Domain\Common\YearMonth;

/**
 * Cuota de un alumno: mensual (una por mes de temporada) o de socio (una por temporada).
 * Plazo de las mensuales: del día 1 al 5 de su mes.
 */
final class Charge
{
    public const int LAST_DAY_IN_TIME = 5;

    private function __construct(
        private readonly ChargeId $id,
        private readonly StudentRef $student,
        private readonly ChargeKind $kind,
        private readonly YearMonth $period,
        private readonly Money $amount,
        private ?PaymentId $paidBy,
        private ?LocalDate $remindedOn,
    ) {
    }

    public static function create(ChargeId $id, StudentRef $student, ChargeKind $kind, YearMonth $period, Money $amount): self
    {
        return new self($id, $student, $kind, $period, $amount, null, null);
    }

    public static function restore(ChargeId $id, StudentRef $student, ChargeKind $kind, YearMonth $period, Money $amount, ?PaymentId $paidBy, ?LocalDate $remindedOn): self
    {
        return new self($id, $student, $kind, $period, $amount, $paidBy, $remindedOn);
    }

    public function statusOn(LocalDate $today): ChargeStatus
    {
        if (null !== $this->paidBy) {
            return ChargeStatus::Paid;
        }
        if (ChargeKind::Membership === $this->kind) {
            return ChargeStatus::Due;
        }

        $current = YearMonth::of($today);
        $day = (int) substr($today->toString(), 8, 2);

        return match (true) {
            $current->isBefore($this->period) => ChargeStatus::Upcoming,
            $this->period->isBefore($current) => ChargeStatus::Overdue,
            $day > self::LAST_DAY_IN_TIME => ChargeStatus::Overdue,
            default => ChargeStatus::Due,
        };
    }

    public function payWith(PaymentId $payment): void
    {
        if (null !== $this->paidBy) {
            throw new ChargeAlreadyPaid();
        }
        $this->paidBy = $payment;
    }

    public function markReminded(LocalDate $on): void
    {
        $this->remindedOn = $on;
    }

    public function isPaid(): bool
    {
        return null !== $this->paidBy;
    }

    public function id(): ChargeId
    {
        return $this->id;
    }

    public function student(): StudentRef
    {
        return $this->student;
    }

    public function kind(): ChargeKind
    {
        return $this->kind;
    }

    public function period(): YearMonth
    {
        return $this->period;
    }

    public function amount(): Money
    {
        return $this->amount;
    }

    public function paidBy(): ?PaymentId
    {
        return $this->paidBy;
    }

    public function remindedOn(): ?LocalDate
    {
        return $this->remindedOn;
    }
}

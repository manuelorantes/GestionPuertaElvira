<?php

declare(strict_types=1);

namespace App\Tests\Support\Billing;

use App\Application\Billing\BillingStudent;
use App\Application\Billing\Port\BillingSettingsRepository;
use App\Application\Billing\Port\ChargeRepository;
use App\Application\Billing\Port\DocumentSequence;
use App\Application\Billing\Port\PaymentRepository;
use App\Application\Billing\Port\StudentAccountRepository;
use App\Application\Billing\Port\StudentDirectory;
use App\Application\Billing\PrivateEnrolment;
use App\Application\Common\Port\ClosedPeriods;
use App\Domain\Billing\BillingSettings;
use App\Domain\Billing\Charge;
use App\Domain\Billing\ChargeId;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\Payment;
use App\Domain\Billing\PaymentId;
use App\Domain\Billing\StudentAccount;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;
use App\Tests\Support\FrozenClock;
use App\Tests\Support\ImmediateTransactionRunner;

/** Dobles en memoria de todos los puertos de Billing. */
final class BillingFixture implements ClosedPeriods, BillingSettingsRepository, StudentAccountRepository, ChargeRepository, PaymentRepository, DocumentSequence, StudentDirectory
{
    public BillingSettings $settings;
    /** @var array<string, StudentAccount> */
    public array $accounts = [];
    /** @var array<string, Charge> */
    public array $charges = [];
    /** @var array<string, Payment> */
    public array $payments = [];
    /** @var array<string, int> */
    public array $sequences = [];
    /** @var array<string, BillingStudent> */
    public array $students = [];
    /** @var list<string> fechas de temporadas cerradas */
    public array $closedDates = [];
    public FrozenClock $clock;
    public ImmediateTransactionRunner $transactions;
    public \App\Tests\Support\RecordingLocks $locks;

    public function __construct(string $now = '2026-10-02 10:00:00')
    {
        $this->settings = BillingSettings::defaults();
        $this->clock = new FrozenClock($now);
        $this->transactions = new ImmediateTransactionRunner();
        $this->locks = new \App\Tests\Support\RecordingLocks();
    }

    /** @param list<PrivateEnrolment> $private */
    public function student(string $name = 'Martina López Herrera', float $regularHours = 2.0, array $private = [], bool $siblings = false): string
    {
        $id = StudentRef::generate()->value;
        $this->students[$id] = new BillingStudent($id, $name, 'Rocío Herrera', '612 48 19 30', $siblings, $regularHours, $private);

        return $id;
    }

    /** Cambia los grupos del alumno (p. ej. sube de nivel o se da de baja). */
    public function changeHours(string $id, float $regularHours): void
    {
        $s = $this->students[$id];
        $this->students[$id] = new BillingStudent($s->id, $s->name, $s->guardianName, $s->guardianPhone, $s->hasSiblings, $regularHours, $s->privateLessons);
    }

    // BillingSettingsRepository
    public function get(): BillingSettings
    {
        return $this->settings;
    }

    public function saveSettings(BillingSettings $settings): void
    {
        $this->settings = $settings;
    }

    // StudentAccountRepository
    public function account(StudentRef $student): ?StudentAccount
    {
        return $this->accounts[$student->value] ?? null;
    }

    public function saveAccount(StudentAccount $account): void
    {
        $this->accounts[$account->student()->value] = $account;
    }

    // ChargeRepository
    public function charge(ChargeId $id): ?Charge
    {
        return $this->charges[$id->value] ?? null;
    }

    public function chargeFor(StudentRef $student, ChargeKind $kind, YearMonth $period): ?Charge
    {
        foreach ($this->charges as $charge) {
            if ($charge->student()->equals($student) && $charge->kind() === $kind && $charge->period()->equals($period)) {
                return $charge;
            }
        }

        return null;
    }

    /** @return list<Charge> */
    public function unpaidFor(StudentRef $student, ChargeKind $kind): array
    {
        $unpaid = array_values(array_filter($this->charges, static fn (Charge $c): bool => $c->student()->equals($student) && $c->kind() === $kind && !$c->isPaid()));
        usort($unpaid, static fn (Charge $a, Charge $b): int => $a->period()->toString() <=> $b->period()->toString());

        return $unpaid;
    }

    public function latestMonthlyPeriod(StudentRef $student): ?YearMonth
    {
        $periods = array_map(static fn (Charge $c): string => $c->period()->toString(), array_filter($this->charges, static fn (Charge $c): bool => $c->student()->equals($student) && ChargeKind::Monthly === $c->kind()));

        return [] === $periods ? null : YearMonth::fromString(max($periods));
    }

    public function saveCharge(Charge $charge): void
    {
        $this->charges[$charge->id()->value] = $charge;
    }

    // PaymentRepository
    public function payment(PaymentId $id): ?Payment
    {
        return $this->payments[$id->value] ?? null;
    }

    public function savePayment(Payment $payment): void
    {
        $this->payments[$payment->id()->value] = $payment;
    }

    // DocumentSequence
    public function next(string $prefix, int $seasonYear): int
    {
        $key = $prefix.$seasonYear;

        return $this->sequences[$key] = ($this->sequences[$key] ?? 0) + 1;
    }

    // StudentDirectory
    /** @return list<BillingStudent> */
    public function activeIn(YearMonth $month): array
    {
        return array_values($this->students);
    }

    public function find(StudentRef $student, LocalDate $day): ?BillingStudent
    {
        return $this->students[$student->value] ?? null;
    }

    public function isClosed(LocalDate $date): bool
    {
        return \in_array($date->toString(), $this->closedDates, true);
    }
}

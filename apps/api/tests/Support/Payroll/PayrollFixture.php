<?php

declare(strict_types=1);

namespace App\Tests\Support\Payroll;

use App\Application\Common\Port\ClosedPeriods;
use App\Application\Payroll\Port\ProposalLog;
use App\Application\Payroll\Port\ScheduleDirectory;
use App\Application\Payroll\Port\SettlementRepository;
use App\Application\Payroll\Port\TeacherRates;
use App\Application\Payroll\Port\TimesheetRepository;
use App\Application\Payroll\TeacherRate;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use App\Domain\Common\YearMonth;
use App\Domain\Payroll\GroupRef;
use App\Domain\Payroll\MonthlySettlement;
use App\Domain\Payroll\ScheduledGroup;
use App\Domain\Payroll\TeacherRef;
use App\Domain\Payroll\TimesheetEntry;
use App\Domain\Payroll\TimesheetEntryId;
use App\Tests\Support\FrozenClock;
use App\Tests\Support\ImmediateTransactionRunner;

/** Dobles en memoria de los puertos de Payroll. */
final class PayrollFixture implements ClosedPeriods, ScheduleDirectory, TeacherRates, TimesheetRepository, SettlementRepository, ProposalLog
{
    /** @var list<ScheduledGroup> */
    public array $groups = [];
    /** @var array<string, TeacherRate> */
    public array $teachers = [];
    /** @var array<string, TimesheetEntry> */
    public array $entries = [];
    /** @var array<string, MonthlySettlement> */
    public array $settlements = [];
    /** @var array<string, true> */
    public array $proposed = [];
    public bool $closed = false;
    public FrozenClock $clock;
    public ImmediateTransactionRunner $transactions;
    public \App\Tests\Support\RecordingLocks $locks;

    public function __construct(string $now = '2026-10-20 10:00:00')
    {
        $this->clock = new FrozenClock($now);
        $this->transactions = new ImmediateTransactionRunner();
        $this->locks = new \App\Tests\Support\RecordingLocks();
    }

    /** @param list<int> $weekdays */
    public function teacherWithGroup(string $name, int $rateCents, string $group, array $weekdays, int $minutes): string
    {
        $teacher = TeacherRef::generate();
        $this->teachers[$teacher->value] = new TeacherRate($teacher->value, $name, Money::cents($rateCents), true);
        $this->groups[] = new ScheduledGroup(GroupRef::generate(), $group, $teacher, $weekdays, $minutes);

        return $teacher->value;
    }

    public function groups(): array
    {
        return $this->groups;
    }

    public function all(): array
    {
        return array_values($this->teachers);
    }

    public function entry(TimesheetEntryId $id): ?TimesheetEntry
    {
        return $this->entries[$id->value] ?? null;
    }

    public function save(TimesheetEntry $entry): void
    {
        $this->entries[$entry->id()->value] = $entry;
    }

    public function delete(TimesheetEntryId $id): void
    {
        unset($this->entries[$id->value]);
    }

    public function forMonth(YearMonth $month): array
    {
        return array_values(array_filter($this->entries, static fn (TimesheetEntry $e): bool => $e->month()->equals($month)));
    }

    public function onDate(LocalDate $date): array
    {
        return array_values(array_filter($this->entries, static fn (TimesheetEntry $e): bool => $e->date()->equals($date)));
    }

    public function settlement(TeacherRef $teacher, YearMonth $month): ?MonthlySettlement
    {
        return $this->settlements[$teacher->value.$month] ?? null;
    }

    public function settlementsOf(YearMonth $month): array
    {
        return array_values(array_filter($this->settlements, static fn (MonthlySettlement $s): bool => $s->month->equals($month)));
    }

    public function saveSettlement(MonthlySettlement $settlement): void
    {
        $this->settlements[$settlement->teacher->value.$settlement->month] = $settlement;
    }

    public function wasProposed(YearMonth $month): bool
    {
        return isset($this->proposed[$month->toString()]);
    }

    public function markProposed(YearMonth $month): void
    {
        $this->proposed[$month->toString()] = true;
    }

    public function isClosed(LocalDate $date): bool
    {
        return $this->closed;
    }
}

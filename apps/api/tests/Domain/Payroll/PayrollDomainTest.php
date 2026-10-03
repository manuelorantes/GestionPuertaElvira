<?php

declare(strict_types=1);

namespace App\Tests\Domain\Payroll;

use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use App\Domain\Common\YearMonth;
use App\Domain\Payroll\GroupRef;
use App\Domain\Payroll\ScheduledGroup;
use App\Domain\Payroll\SessionMinutes;
use App\Domain\Payroll\SessionPlanner;
use App\Domain\Payroll\SettlementCalculator;
use App\Domain\Payroll\TeacherRef;
use App\Domain\Payroll\TimesheetEntry;
use App\Domain\Payroll\TimesheetEntryId;
use PHPUnit\Framework\TestCase;

final class PayrollDomainTest extends TestCase
{
    public function test_should_accept_half_hours_between_half_an_hour_and_twelve_hours(): void
    {
        self::assertSame(90, SessionMinutes::fromHours(1.5)->minutes);
        self::assertSame('1,5 h', SessionMinutes::fromMinutes(90)->label());
        $this->expectException(InvalidValue::class);
        SessionMinutes::fromHours(1.25);
    }

    public function test_should_propose_a_session_for_every_class_day_of_the_month(): void
    {
        $teacher = TeacherRef::generate();
        $groups = [
            new ScheduledGroup(GroupRef::generate(), 'Iniciación A', $teacher, [1, 3], 60),
            new ScheduledGroup(GroupRef::generate(), 'Competición', $teacher, [5], 90),
        ];

        $sessions = new SessionPlanner()->plan(YearMonth::fromString('2026-10'), $groups);

        // Octubre 2026: lunes 5, 12, 19, 26 · miércoles 7, 14, 21, 28 · viernes 2, 9, 16, 23, 30
        self::assertCount(13, $sessions);
        self::assertSame('2026-10-02', $sessions[0]->date->toString());
        self::assertSame('Competición', $sessions[0]->group->name);
        self::assertSame(90, $sessions[0]->minutes->minutes);
        self::assertSame(8 * 60 + 5 * 90, array_sum(array_map(static fn ($s): int => $s->minutes->minutes, $sessions)));
    }

    public function test_should_not_propose_sessions_outside_the_teaching_season(): void
    {
        $groups = [new ScheduledGroup(GroupRef::generate(), 'Iniciación A', TeacherRef::generate(), [1], 60)];

        self::assertSame([], new SessionPlanner()->plan(YearMonth::fromString('2027-07'), $groups));
    }

    public function test_should_reassign_and_resize_a_session(): void
    {
        $entry = TimesheetEntry::record(TimesheetEntryId::generate(), TeacherRef::generate(), LocalDate::fromString('2026-10-05'), GroupRef::generate(), 'Iniciación A', SessionMinutes::fromHours(1), false);
        $substitute = TeacherRef::generate();

        $entry->reassign($substitute);
        $entry->changeDuration(SessionMinutes::fromHours(1.5));

        self::assertTrue($entry->teacher()->equals($substitute));
        self::assertSame(90, $entry->minutes()->minutes);
        self::assertTrue(YearMonth::fromString('2026-10')->equals($entry->month()));
    }

    public function test_should_settle_hours_by_rate_with_a_breakdown_per_group(): void
    {
        $teacher = TeacherRef::generate();
        $group = GroupRef::generate();
        $entries = [
            $this->entry($teacher, '2026-10-05', $group, 'Iniciación A', 1.0),
            $this->entry($teacher, '2026-10-07', $group, 'Iniciación A', 1.0),
            $this->entry($teacher, '2026-10-09', null, 'Torneo escolar', 2.5),
        ];

        $settlement = new SettlementCalculator()->settle($entries, Money::cents(1650));

        self::assertSame(270, $settlement->minutes);
        self::assertSame(7425, $settlement->amount->cents);
        self::assertSame([['Iniciación A', 120, 3300], ['Torneo escolar', 150, 4125]], array_map(static fn ($l): array => [$l->label, $l->minutes, $l->amount->cents], $settlement->lines));
    }

    private function entry(TeacherRef $teacher, string $date, ?GroupRef $group, string $label, float $hours): TimesheetEntry
    {
        return TimesheetEntry::record(TimesheetEntryId::generate(), $teacher, LocalDate::fromString($date), $group, $label, SessionMinutes::fromHours($hours), false);
    }
}

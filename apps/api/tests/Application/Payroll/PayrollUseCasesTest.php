<?php

declare(strict_types=1);

namespace App\Tests\Application\Payroll;

use App\Application\Payroll\DeleteSession;
use App\Application\Payroll\ListSettlements;
use App\Application\Payroll\MarkHoliday;
use App\Application\Payroll\PayAllSettlements;
use App\Application\Payroll\PaySettlement;
use App\Application\Payroll\ProposeMonthSessions;
use App\Application\Payroll\RecordSession;
use App\Application\Payroll\SessionInput;
use App\Application\Payroll\UpdateSession;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\YearMonth;
use App\Domain\Payroll\Error\SettlementAlreadyPaid;
use App\Tests\Support\Payroll\PayrollFixture;
use PHPUnit\Framework\TestCase;

final class PayrollUseCasesTest extends TestCase
{
    private PayrollFixture $fx;
    private string $lucia;
    private string $carlos;

    protected function setUp(): void
    {
        $this->fx = new PayrollFixture('2026-10-20 10:00:00');
        $this->lucia = $this->fx->teacherWithGroup('Lucía Moreno Gil', 1600, 'Iniciación A', [1, 3], 60);
        $this->carlos = $this->fx->teacherWithGroup('Carlos Ruiz Márquez', 1800, 'Adultos I', [2], 90);
    }

    public function test_should_propose_the_month_once_and_respect_deletions(): void
    {
        $this->propose('2026-10');
        self::assertCount(8 + 4, $this->fx->entries);

        $first = array_key_first($this->fx->entries);
        new DeleteSession($this->fx, $this->fx)($first);
        $this->propose('2026-10');

        self::assertCount(11, $this->fx->entries);
    }

    public function test_should_not_propose_months_older_than_the_previous_one(): void
    {
        $this->propose('2026-08');
        $this->propose('2025-10');

        self::assertSame([], $this->fx->entries);
    }

    public function test_should_refuse_sessions_for_unknown_teachers(): void
    {
        $this->expectException(InvalidValue::class);

        new RecordSession($this->fx, $this->fx, $this->fx, $this->fx)(new SessionInput(\App\Domain\Payroll\TeacherRef::generate()->value, '2026-10-15', null, 'Torneo', 1.0));
    }

    public function test_should_not_propose_future_months(): void
    {
        $this->propose('2026-11');

        self::assertSame([], $this->fx->entries);
        self::assertFalse($this->fx->wasProposed(YearMonth::fromString('2026-11')));
    }

    public function test_should_record_group_sessions_and_other_activities(): void
    {
        $group = $this->fx->groups[0]->id->value;

        $record = new RecordSession($this->fx, $this->fx, $this->fx, $this->fx);
        $groupSession = $record(new SessionInput($this->carlos, '2026-10-15', $group, null, 1.0));
        $activity = $record(new SessionInput($this->lucia, '2026-10-17', null, 'Torneo escolar', 3.0));

        self::assertSame('Iniciación A', $this->fx->entries[$groupSession]->label());
        self::assertSame(180, $this->fx->entries[$activity]->minutes()->minutes);
        $this->expectException(InvalidValue::class);
        $record(new SessionInput($this->lucia, '2026-10-17', null, '  ', 1.0));
    }

    public function test_should_substitute_a_teacher_and_mark_a_holiday(): void
    {
        $this->propose('2026-10');
        $mondaySession = array_values(array_filter($this->fx->entries, static fn ($e): bool => '2026-10-12' === $e->date()->toString()))[0];

        new UpdateSession($this->fx, $this->fx, $this->fx)($mondaySession->id()->value, $this->carlos, 1.5);
        self::assertSame($this->carlos, $mondaySession->teacher()->value);
        self::assertSame(90, $mondaySession->minutes()->minutes);

        $removed = new MarkHoliday($this->fx, $this->fx)('2026-10-12');
        self::assertSame(1, $removed);
        self::assertCount(11, $this->fx->entries);
    }

    public function test_should_list_pending_settlements_with_the_current_rate(): void
    {
        $this->propose('2026-10');

        $settlements = new ListSettlements($this->fx, $this->fx, $this->fx)('2026-10');

        self::assertSame(['Carlos Ruiz Márquez', 'Lucía Moreno Gil'], array_map(static fn ($s): string => $s->teacherName, $settlements));
        self::assertSame('pending', $settlements[1]->status);
        self::assertSame(480, $settlements[1]->minutes);
        self::assertSame(12800, $settlements[1]->amountCents);
        self::assertSame(10800, $settlements[0]->amountCents, '4 martes × 1,5 h × 18 €');
    }

    public function test_should_pay_a_settlement_freezing_it_and_locking_its_sessions(): void
    {
        $this->propose('2026-10');
        new PaySettlement($this->fx, $this->fx, $this->fx, $this->fx, $this->fx->transactions, $this->fx->locks)($this->lucia, '2026-10', '2026-11-02');
        $this->fx->teachers[$this->lucia] = new \App\Application\Payroll\TeacherRate($this->lucia, 'Lucía Moreno Gil', \App\Domain\Common\Money::cents(9900), true);

        $lucia = new ListSettlements($this->fx, $this->fx, $this->fx)('2026-10')[1];
        self::assertSame('paid', $lucia->status);
        self::assertSame('2026-11-02', $lucia->paidOn);
        self::assertSame(12800, $lucia->amountCents);

        $session = array_values(array_filter($this->fx->entries, fn ($e): bool => $e->teacher()->value === $this->lucia))[0];
        $this->expectException(SettlementAlreadyPaid::class);
        new DeleteSession($this->fx, $this->fx)($session->id()->value);
    }

    public function test_should_refuse_paying_in_a_closed_season(): void
    {
        $this->propose('2026-10');
        $this->fx->closed = true;

        $this->expectException(\App\Application\Common\Error\PeriodClosed::class);

        new PaySettlement($this->fx, $this->fx, $this->fx, $this->fx, $this->fx->transactions, $this->fx->locks)($this->lucia, '2026-10', '2026-11-02');
    }

    public function test_should_pay_every_pending_settlement_of_the_month(): void
    {
        $this->propose('2026-10');

        $paid = new PayAllSettlements(new PaySettlement($this->fx, $this->fx, $this->fx, $this->fx, $this->fx->transactions, $this->fx->locks), new ListSettlements($this->fx, $this->fx, $this->fx), $this->fx->transactions)('2026-10', '2026-11-02');

        self::assertSame(2, $paid);
        self::assertCount(2, $this->fx->settlements);
        $this->expectException(SettlementAlreadyPaid::class);
        new PaySettlement($this->fx, $this->fx, $this->fx, $this->fx, $this->fx->transactions, $this->fx->locks)($this->carlos, '2026-10', '2026-11-03');
    }

    private function propose(string $month): void
    {
        new ProposeMonthSessions($this->fx, $this->fx, $this->fx, $this->fx, $this->fx->clock, $this->fx->transactions, $this->fx->locks)($month);
    }
}

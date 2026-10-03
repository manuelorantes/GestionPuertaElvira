<?php

declare(strict_types=1);

namespace App\Tests\Integration\Persistence\Payroll;

use App\Application\Billing\GenerateMonthlyCharges;
use App\Application\Billing\PaymentRequest;
use App\Application\Billing\RegisterPayment;
use App\Application\Classes\CreateClassGroup;
use App\Application\Classes\GroupInput;
use App\Application\Payroll\ListSettlements;
use App\Application\Payroll\PaySettlement;
use App\Application\Payroll\Profitability;
use App\Application\Payroll\ProposeMonthSessions;
use App\Application\Students\RegisterStudent;
use App\Application\Students\StudentInput;
use App\Application\Teachers\ChangeTeacherRate;
use App\Application\Teachers\RegisterTeacher;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;
use App\Infrastructure\Payroll\SqlPayrollQuery;
use App\Infrastructure\Payroll\SqlScheduleDirectory;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class PayrollPersistenceTest extends KernelTestCase
{
    private string $teacher;
    private string $group;
    private YearMonth $month;

    protected function setUp(): void
    {
        $this->month = YearMonth::of(LocalDate::fromInstant(new DateTimeImmutable()));
        if (null === Season::teachingSeason($this->month)) {
            self::markTestSkipped('En julio y agosto no hay clases.');
        }
        $c = self::getContainer();
        $this->teacher = $c->get(RegisterTeacher::class)('Lucía Moreno Gil');
        $c->get(ChangeTeacherRate::class)($this->teacher, '16');
        $this->group = $c->get(CreateClassGroup::class)(new GroupInput('Iniciación A', 'beginner', $this->teacher, ['mon', 'wed'], '17:00', '18:00', 1, 12));
    }

    public function test_should_read_the_schedule_with_weekdays_and_durations(): void
    {
        $groups = self::getContainer()->get(SqlScheduleDirectory::class)->groups();

        self::assertCount(1, $groups);
        self::assertSame([1, 3], $groups[0]->weekdays);
        self::assertSame(60, $groups[0]->minutes);
        self::assertSame($this->teacher, $groups[0]->teacher->value);
    }

    public function test_should_propose_list_settle_and_freeze_sessions(): void
    {
        $c = self::getContainer();
        $c->get(ProposeMonthSessions::class)($this->month->toString());
        $c->get(EntityManagerInterface::class)->clear();

        $sessions = $c->get(SqlPayrollQuery::class)->sessions($this->month, null);
        self::assertNotEmpty($sessions);
        self::assertSame('Lucía Moreno Gil', $sessions[0]->teacherName);
        self::assertSame(1600, $sessions[0]->costCents);
        self::assertFalse($sessions[0]->locked);

        $c->get(PaySettlement::class)($this->teacher, $this->month->toString(), LocalDate::fromInstant(new DateTimeImmutable())->toString());
        $c->get(ChangeTeacherRate::class)($this->teacher, '99');
        $c->get(EntityManagerInterface::class)->clear();

        $settlement = $c->get(ListSettlements::class)($this->month->toString())[0];
        self::assertSame('paid', $settlement->status);
        self::assertSame(1600, $settlement->rateCents);
        self::assertSame(\count($sessions) * 1600, $settlement->amountCents);
        self::assertTrue($c->get(SqlPayrollQuery::class)->sessions($this->month, $this->teacher)[0]->locked);
    }

    public function test_should_attribute_paid_fees_to_the_teacher_of_the_groups(): void
    {
        $c = self::getContainer();
        $student = $c->get(RegisterStudent::class)(new StudentInput('Martina López Herrera', '2014-03-12', null, null, [['name' => 'Rocío Herrera', 'phone' => '612481930']], null, null, true), [$this->group], [], false);
        $c->get(GenerateMonthlyCharges::class)($this->month->toString());
        $c->get(RegisterPayment::class)(new PaymentRequest($student, 'monthly', 1, 'cash', LocalDate::fromInstant(new DateTimeImmutable())->toString(), false, null, null));
        $c->get(ProposeMonthSessions::class)($this->month->toString());

        $rows = $c->get(Profitability::class)($this->month->toString());

        self::assertCount(1, $rows);
        self::assertSame(4500, $rows[0]->incomeCents, 'tramo de 2 h semanales');
        self::assertSame(['Iniciación A'], $rows[0]->groups);
        self::assertSame(1, $rows[0]->occupied);
        self::assertSame(12, $rows[0]->capacity);
        self::assertSame(4500 - $rows[0]->costCents, $rows[0]->marginCents);
    }
}

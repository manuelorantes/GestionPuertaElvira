<?php

declare(strict_types=1);

namespace App\Tests\Application\Classes;

use App\Application\Classes\EndStudentEnrolments;
use App\Application\Classes\EnrolStudent;
use App\Application\Classes\Error\LastEnrolment;
use App\Application\Classes\Error\NotEnrolled;
use App\Application\Classes\MoveStudent;
use App\Application\Classes\Port\StudentStatus;
use App\Application\Classes\UnenrolStudent;
use App\Domain\Classes\ClassGroup;
use App\Domain\Classes\Error\GroupFull;
use App\Domain\Classes\Error\StudentScheduleOverlap;
use App\Domain\Classes\StudentReference;
use App\Domain\Classes\Weekday;
use App\Domain\Common\LocalDate;
use App\Tests\Support\Classes\GroupFactory;
use App\Tests\Support\Classes\InMemoryClassGroupRepository;
use App\Tests\Support\Classes\InMemoryEnrolmentRepository;
use App\Tests\Support\FrozenClock;
use App\Tests\Support\ImmediateTransactionRunner;
use PHPUnit\Framework\TestCase;

final class EnrolmentUseCasesTest extends TestCase
{
    private InMemoryClassGroupRepository $groups;
    private InMemoryEnrolmentRepository $enrolments;
    private FrozenClock $clock;
    private ImmediateTransactionRunner $transactions;
    private string $student;
    private bool $studentActive = true;

    protected function setUp(): void
    {
        $this->groups = new InMemoryClassGroupRepository();
        $this->enrolments = new InMemoryEnrolmentRepository();
        $this->clock = new FrozenClock('2026-10-02 10:00:00');
        $this->transactions = new ImmediateTransactionRunner();
        $this->student = StudentReference::generate()->value;
    }

    public function test_should_enrol_today_and_count_in_the_group_occupancy(): void
    {
        $group = $this->group('Iniciación A', [Weekday::Monday], '17:00', '18:00');

        $this->enrol()($this->student, $group->id()->value, false);

        self::assertSame(1, $this->enrolments->activeCount($group->id(), $this->today()));
    }

    public function test_should_refuse_a_group_that_overlaps_with_another_of_the_student(): void
    {
        $first = $this->group('Iniciación A', [Weekday::Monday], '17:00', '18:00');
        $second = $this->group('Particular', [Weekday::Monday], '17:30', '18:30', classroom: 2);
        $this->enrol()($this->student, $first->id()->value, false);

        $this->expectException(StudentScheduleOverlap::class);

        $this->enrol()($this->student, $second->id()->value, false);
    }

    public function test_should_ask_for_confirmation_when_full_and_accept_it_when_confirmed(): void
    {
        $group = $this->group('Particular', [Weekday::Friday], '17:30', '19:00', capacity: 1);
        $this->enrol()(StudentReference::generate()->value, $group->id()->value, false);

        try {
            $this->enrol()($this->student, $group->id()->value, false);
            self::fail('Se esperaba GroupFull');
        } catch (GroupFull) {
        }

        $this->enrol()($this->student, $group->id()->value, true);
        self::assertSame(2, $this->enrolments->activeCount($group->id(), $this->today()));
    }

    public function test_should_unenrol_from_one_group_when_the_student_keeps_another(): void
    {
        $a = $this->group('Iniciación A', [Weekday::Monday], '17:00', '18:00');
        $b = $this->group('Particular', [Weekday::Friday], '17:30', '19:00');
        $this->enrol()($this->student, $a->id()->value, false);
        $this->enrol()($this->student, $b->id()->value, false);

        $this->unenrol()($this->student, $a->id()->value);

        self::assertSame(0, $this->enrolments->activeCount($a->id(), $this->today()));
        self::assertSame(1, $this->enrolments->activeCount($b->id(), $this->today()));
    }

    public function test_should_keep_the_last_group_of_an_active_student(): void
    {
        $a = $this->group('Iniciación A', [Weekday::Monday], '17:00', '18:00');
        $this->enrol()($this->student, $a->id()->value, false);

        $this->expectException(LastEnrolment::class);

        $this->unenrol()($this->student, $a->id()->value);
    }

    public function test_should_fail_clearly_when_the_student_is_not_in_the_group(): void
    {
        $a = $this->group('Iniciación A', [Weekday::Monday], '17:00', '18:00');

        $this->expectException(NotEnrolled::class);

        $this->unenrol()($this->student, $a->id()->value);
    }

    public function test_should_move_atomically_ignoring_the_group_being_left_for_overlaps(): void
    {
        $from = $this->group('Iniciación A', [Weekday::Monday], '17:00', '18:00');
        $to = $this->group('Iniciación C', [Weekday::Monday], '17:00', '18:00', classroom: 2);
        $this->enrol()($this->student, $from->id()->value, false);

        new MoveStudent($this->groups, $this->enrolments, $this->clock, $this->transactions)($this->student, $from->id()->value, $to->id()->value, false);

        self::assertSame(0, $this->enrolments->activeCount($from->id(), $this->today()));
        self::assertSame(1, $this->enrolments->activeCount($to->id(), $this->today()));
        self::assertSame(1, $this->transactions->runs);
    }

    public function test_should_end_every_enrolment_on_the_withdrawal_date(): void
    {
        $a = $this->group('Iniciación A', [Weekday::Monday], '17:00', '18:00');
        $b = $this->group('Particular', [Weekday::Friday], '17:30', '19:00');
        $this->enrol()($this->student, $a->id()->value, false);
        $this->enrol()($this->student, $b->id()->value, false);

        new EndStudentEnrolments($this->enrolments)($this->student, LocalDate::fromString('2026-10-31'));

        self::assertSame(1, $this->enrolments->activeCount($a->id(), LocalDate::fromString('2026-10-30')));
        self::assertSame(0, $this->enrolments->activeCount($a->id(), LocalDate::fromString('2026-10-31')));
        self::assertSame(0, $this->enrolments->activeCount($b->id(), LocalDate::fromString('2026-11-02')));
    }

    private function enrol(): EnrolStudent
    {
        return new EnrolStudent($this->groups, $this->enrolments, $this->clock);
    }

    private function unenrol(): UnenrolStudent
    {
        $status = new class($this->studentActive) implements StudentStatus {
            public function __construct(private bool $active)
            {
            }

            public function isActive(StudentReference $student): bool
            {
                return $this->active;
            }
        };

        return new UnenrolStudent($this->enrolments, $status, $this->clock);
    }

    /** @param list<Weekday> $days */
    private function group(string $name, array $days, string $start, string $end, int $classroom = 1, int $capacity = 12): ClassGroup
    {
        $group = GroupFactory::group($days, $start, $end, $classroom, $name, $capacity);
        $this->groups->save($group);

        return $group;
    }

    private function today(): LocalDate
    {
        return LocalDate::fromString('2026-10-02');
    }
}

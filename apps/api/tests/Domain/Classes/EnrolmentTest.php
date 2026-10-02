<?php

declare(strict_types=1);

namespace App\Tests\Domain\Classes;

use App\Domain\Classes\Enrolment;
use App\Domain\Classes\EnrolmentId;
use App\Domain\Classes\EnrolmentPolicy;
use App\Domain\Classes\Error\AlreadyEnrolled;
use App\Domain\Classes\Error\GroupFull;
use App\Domain\Classes\Error\StudentScheduleOverlap;
use App\Domain\Classes\OverCapacity;
use App\Domain\Classes\StudentReference;
use App\Domain\Classes\Weekday;
use App\Domain\Common\LocalDate;
use App\Tests\Support\Classes\GroupFactory;
use PHPUnit\Framework\TestCase;

final class EnrolmentTest extends TestCase
{
    public function test_should_be_active_from_its_start_until_the_day_before_it_ends(): void
    {
        $enrolment = Enrolment::start(EnrolmentId::generate(), StudentReference::generate(), GroupFactory::group()->id(), LocalDate::fromString('2026-09-15'));

        self::assertFalse($enrolment->isActiveOn(LocalDate::fromString('2026-09-14')));
        self::assertTrue($enrolment->isActiveOn(LocalDate::fromString('2026-09-15')));

        $enrolment->endOn(LocalDate::fromString('2026-10-01'));

        self::assertTrue($enrolment->isActiveOn(LocalDate::fromString('2026-09-30')));
        self::assertFalse($enrolment->isActiveOn(LocalDate::fromString('2026-10-01')));
    }

    public function test_should_accept_a_new_enrolment_with_free_seats_and_no_clash(): void
    {
        $target = GroupFactory::group(days: [Weekday::Friday], start: '17:30', end: '19:00');
        $current = GroupFactory::group(days: [Weekday::Monday], start: '17:00', end: '18:00');

        new EnrolmentPolicy()->assertCanEnrol($target, [$current], occupied: 5, overCapacity: OverCapacity::NotConfirmed);

        $this->addToAssertionCount(1);
    }

    public function test_should_refuse_a_second_enrolment_in_the_same_group(): void
    {
        $target = GroupFactory::group();

        $this->expectException(AlreadyEnrolled::class);

        new EnrolmentPolicy()->assertCanEnrol($target, [$target], 5, OverCapacity::NotConfirmed);
    }

    public function test_should_refuse_a_group_that_clashes_with_another_of_the_student(): void
    {
        $target = GroupFactory::group(days: [Weekday::Monday], start: '17:30', end: '18:30', name: 'Particular');
        $current = GroupFactory::group(days: [Weekday::Monday, Weekday::Wednesday], start: '17:00', end: '18:00', classroom: 2, name: 'Iniciación A');

        try {
            new EnrolmentPolicy()->assertCanEnrol($target, [$current], 0, OverCapacity::NotConfirmed);
            self::fail('Se esperaba StudentScheduleOverlap');
        } catch (StudentScheduleOverlap $overlap) {
            self::assertSame('Iniciación A', $overlap->details()['groupName']);
        }
    }

    public function test_should_require_confirmation_when_the_group_is_full(): void
    {
        $target = GroupFactory::group(capacity: 12);

        try {
            new EnrolmentPolicy()->assertCanEnrol($target, [], 12, OverCapacity::NotConfirmed);
            self::fail('Se esperaba GroupFull');
        } catch (GroupFull $full) {
            self::assertSame(['occupied' => 12, 'capacity' => 12], $full->details());
            self::assertSame('El grupo está completo (12/12).', $full->getMessage());
        }

        new EnrolmentPolicy()->assertCanEnrol($target, [], 12, OverCapacity::Confirmed);
    }
}

<?php

declare(strict_types=1);

namespace App\Tests\Domain\Students;

use App\Domain\Common\FullName;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\PhoneNumber;
use App\Domain\Students\Error\MissingContact;
use App\Domain\Students\Guardian;
use App\Domain\Students\Student;
use App\Domain\Students\StudentId;
use App\Tests\Support\Students\StudentFactory;
use PHPUnit\Framework\TestCase;

final class StudentTest extends TestCase
{
    private LocalDate $today;

    protected function setUp(): void
    {
        $this->today = LocalDate::fromString('2026-10-02');
    }

    public function test_should_register_an_active_minor_with_a_guardian(): void
    {
        $student = Student::register(StudentId::generate(), StudentFactory::details(), $this->today);

        self::assertTrue($student->isActiveOn($this->today));
        self::assertSame(12, $student->details()->birthDate->ageOn($this->today));
        self::assertTrue($student->joinedOn()->equals($this->today));
    }

    public function test_should_refuse_a_minor_without_guardians(): void
    {
        $this->expectExceptionObject(MissingContact::minorWithoutGuardian());

        Student::register(StudentId::generate(), StudentFactory::details(guardians: []), $this->today);
    }

    public function test_should_accept_an_adult_without_guardian_only_with_own_phone(): void
    {
        $adult = Student::register(StudentId::generate(), StudentFactory::details(name: 'Javier Navarro Pérez', birthDate: '1984-05-01', guardians: [], ownPhone: '677528810'), $this->today);
        self::assertTrue($adult->isActiveOn($this->today));

        $this->expectExceptionObject(MissingContact::adultWithoutPhone());
        Student::register(StudentId::generate(), StudentFactory::details(birthDate: '1984-05-01', guardians: []), $this->today);
    }

    public function test_should_allow_at_most_two_guardians(): void
    {
        $guardian = new Guardian(FullName::fromString('Tutor Uno'), PhoneNumber::fromString('612481930'));

        $this->expectException(InvalidValue::class);

        Student::register(StudentId::generate(), StudentFactory::details(guardians: [$guardian, $guardian, $guardian]), $this->today);
    }

    public function test_should_reject_a_birth_date_in_the_future(): void
    {
        $this->expectException(InvalidValue::class);

        Student::register(StudentId::generate(), StudentFactory::details(birthDate: '2027-01-01'), $this->today);
    }

    public function test_should_stop_being_active_from_the_withdrawal_date(): void
    {
        $student = Student::register(StudentId::generate(), StudentFactory::details(), $this->today);

        $student->withdraw(LocalDate::fromString('2026-10-31'), $this->today);

        self::assertTrue($student->isActiveOn(LocalDate::fromString('2026-10-30')));
        self::assertFalse($student->isActiveOn(LocalDate::fromString('2026-10-31')));
    }

    public function test_should_reject_a_withdrawal_before_joining(): void
    {
        $student = Student::register(StudentId::generate(), StudentFactory::details(), $this->today);

        $this->expectException(InvalidValue::class);

        $student->withdraw(LocalDate::fromString('2026-09-01'), $this->today);
    }

    public function test_should_apply_contact_rules_when_details_change(): void
    {
        $student = Student::register(StudentId::generate(), StudentFactory::details(), $this->today);

        $this->expectException(MissingContact::class);

        $student->updateDetails(StudentFactory::details(guardians: []), $this->today);
    }

    public function test_should_manage_siblings_without_including_itself(): void
    {
        $student = Student::register(StudentId::generate(), StudentFactory::details(), $this->today);
        $sibling = StudentId::generate();

        $student->addSibling($sibling);
        $student->addSibling($sibling);
        self::assertEquals([$sibling], $student->siblings());

        $student->removeSibling($sibling);
        self::assertSame([], $student->siblings());

        $this->expectException(InvalidValue::class);
        $student->addSibling($student->id());
    }
}

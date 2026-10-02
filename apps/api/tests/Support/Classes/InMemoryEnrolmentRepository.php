<?php

declare(strict_types=1);

namespace App\Tests\Support\Classes;

use App\Application\Classes\Port\EnrolmentRepository;
use App\Domain\Classes\ClassGroupId;
use App\Domain\Classes\Enrolment;
use App\Domain\Classes\StudentReference;
use App\Domain\Common\LocalDate;

final class InMemoryEnrolmentRepository implements EnrolmentRepository
{
    /** @var array<string, Enrolment> */
    public array $enrolments = [];

    public function save(Enrolment $enrolment): void
    {
        $this->enrolments[$enrolment->id()->value] = $enrolment;
    }

    public function activeForStudent(StudentReference $student, LocalDate $on): array
    {
        return array_values(array_filter($this->enrolments, static fn (Enrolment $e): bool => $e->student()->equals($student) && $e->isActiveOn($on)));
    }

    public function activeForStudentInGroup(StudentReference $student, ClassGroupId $group, LocalDate $on): ?Enrolment
    {
        foreach ($this->activeForStudent($student, $on) as $enrolment) {
            if ($enrolment->group()->equals($group)) {
                return $enrolment;
            }
        }

        return null;
    }

    public function activeCount(ClassGroupId $group, LocalDate $on): int
    {
        return \count(array_filter($this->enrolments, static fn (Enrolment $e): bool => $e->group()->equals($group) && $e->isActiveOn($on)));
    }
}

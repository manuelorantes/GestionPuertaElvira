<?php

declare(strict_types=1);

namespace App\Application\Classes\Port;

use App\Domain\Classes\ClassGroupId;
use App\Domain\Classes\Enrolment;
use App\Domain\Classes\StudentReference;
use App\Domain\Common\LocalDate;

interface EnrolmentRepository
{
    public function save(Enrolment $enrolment): void;

    /** @return list<Enrolment> */
    public function activeForStudent(StudentReference $student, LocalDate $on): array;

    public function activeForStudentInGroup(StudentReference $student, ClassGroupId $group, LocalDate $on): ?Enrolment;

    public function activeCount(ClassGroupId $group, LocalDate $on): int;
}

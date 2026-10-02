<?php

declare(strict_types=1);

namespace App\Application\Classes;

use App\Application\Classes\Error\LastEnrolment;
use App\Application\Classes\Error\NotEnrolled;
use App\Application\Classes\Port\EnrolmentRepository;
use App\Application\Classes\Port\StudentStatus;
use App\Domain\Classes\ClassGroupId;
use App\Domain\Classes\StudentReference;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;

final readonly class UnenrolStudent
{
    public function __construct(private EnrolmentRepository $enrolments, private StudentStatus $students, private Clock $clock)
    {
    }

    public function __invoke(string $studentId, string $groupId): void
    {
        $student = StudentReference::fromString($studentId);
        $today = LocalDate::fromInstant($this->clock->now());
        $enrolment = $this->enrolments->activeForStudentInGroup($student, ClassGroupId::fromString($groupId), $today) ?? throw new NotEnrolled();

        $isLastGroup = 1 === \count($this->enrolments->activeForStudent($student, $today));
        if ($isLastGroup && $this->students->isActive($student)) {
            throw new LastEnrolment();
        }

        $enrolment->endOn($today);
        $this->enrolments->save($enrolment);
    }
}

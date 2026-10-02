<?php

declare(strict_types=1);

namespace App\Infrastructure\Students;

use App\Application\Classes\EndStudentEnrolments;
use App\Application\Classes\EnrolStudent;
use App\Application\Students\Port\Enrolments;
use App\Domain\Common\LocalDate;
use App\Domain\Students\StudentId;

/** Alumnado pide a Clases que inscriba o termine las inscripciones de un alumno. */
final readonly class ClassesEnrolments implements Enrolments
{
    public function __construct(private EnrolStudent $enrolStudent, private EndStudentEnrolments $endEnrolments)
    {
    }

    public function enrol(StudentId $student, array $groupIds, bool $confirmOverCapacity): void
    {
        foreach ($groupIds as $groupId) {
            ($this->enrolStudent)($student->value, $groupId, $confirmOverCapacity);
        }
    }

    public function endAll(StudentId $student, LocalDate $on): void
    {
        ($this->endEnrolments)($student->value, $on);
    }
}

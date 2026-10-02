<?php

declare(strict_types=1);

namespace App\Application\Classes;

use App\Application\Classes\Port\EnrolmentRepository;
use App\Domain\Classes\StudentReference;
use App\Domain\Common\LocalDate;

/** Al dar de baja a un alumno, sus inscripciones terminan en la fecha de baja. */
final readonly class EndStudentEnrolments
{
    public function __construct(private EnrolmentRepository $enrolments)
    {
    }

    public function __invoke(string $studentId, LocalDate $on): void
    {
        foreach ($this->enrolments->activeForStudent(StudentReference::fromString($studentId), $on) as $enrolment) {
            $enrolment->endOn($on);
            $this->enrolments->save($enrolment);
        }
    }
}

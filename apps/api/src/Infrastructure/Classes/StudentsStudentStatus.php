<?php

declare(strict_types=1);

namespace App\Infrastructure\Classes;

use App\Application\Classes\Port\StudentStatus;
use App\Application\Students\Port\StudentRepository;
use App\Domain\Classes\StudentReference;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Domain\Students\StudentId;

/** Clases pregunta a Alumnado si un alumno sigue activo hoy. */
final readonly class StudentsStudentStatus implements StudentStatus
{
    public function __construct(private StudentRepository $students, private Clock $clock)
    {
    }

    public function isActive(StudentReference $student): bool
    {
        return $this->students->find(StudentId::fromString($student->value))?->isActiveOn(LocalDate::fromInstant($this->clock->now())) ?? false;
    }
}

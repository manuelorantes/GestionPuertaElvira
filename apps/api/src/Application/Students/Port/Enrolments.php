<?php

declare(strict_types=1);

namespace App\Application\Students\Port;

use App\Domain\Common\LocalDate;
use App\Domain\Students\StudentId;

/** Inscripciones del alumno en grupos (las gestiona el contexto de Clases). */
interface Enrolments
{
    /** @param list<string> $groupIds */
    public function enrol(StudentId $student, array $groupIds, bool $confirmOverCapacity, ?LocalDate $from = null): void;

    public function endAll(StudentId $student, LocalDate $on): void;
}

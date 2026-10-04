<?php

declare(strict_types=1);

namespace App\Application\Import\Port;

use App\Application\Import\StudentCandidate;

/** Alumnos existentes con los que vincular cada fila de la hoja. */
interface StudentMatcher
{
    /** Alumno con exactamente ese nombre (sin tildes ni mayúsculas), o null. */
    public function byName(string $fullName): ?StudentCandidate;

    /**
     * Hasta tres alumnos parecidos, los más parecidos primero.
     *
     * @return list<StudentCandidate>
     */
    public function similar(string $fullName): array;

    public function exists(string $studentId): bool;
}

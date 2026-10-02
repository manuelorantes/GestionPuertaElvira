<?php

declare(strict_types=1);

namespace App\Application\Classes\Port;

use App\Domain\Classes\StudentReference;

/** Si un alumno sigue activo en el club (lo responde el contexto de Alumnado). */
interface StudentStatus
{
    public function isActive(StudentReference $student): bool;
}

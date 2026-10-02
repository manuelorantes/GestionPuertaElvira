<?php

declare(strict_types=1);

namespace App\Application\Teachers\Port;

use App\Domain\Teachers\TeacherId;

/** Cuántos grupos tiene asignados un profesor (lo responde el contexto de Clases). */
interface TeacherAssignments
{
    public function groupCount(TeacherId $teacherId): int;
}

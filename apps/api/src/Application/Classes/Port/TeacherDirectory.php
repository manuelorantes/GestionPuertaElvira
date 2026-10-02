<?php

declare(strict_types=1);

namespace App\Application\Classes\Port;

use App\Domain\Classes\TeacherReference;

/** Si un profesor existe y está activo (lo responde el contexto de Profesorado). */
interface TeacherDirectory
{
    public function isActive(TeacherReference $teacher): bool;
}

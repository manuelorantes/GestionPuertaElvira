<?php

declare(strict_types=1);

namespace App\Application\Teachers\Port;

use App\Application\Teachers\TeacherSummary;

interface TeacherQuery
{
    /** @return list<TeacherSummary> ordenados por nombre */
    public function all(): array;
}

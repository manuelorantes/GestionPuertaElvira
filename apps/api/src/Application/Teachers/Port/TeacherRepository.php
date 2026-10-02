<?php

declare(strict_types=1);

namespace App\Application\Teachers\Port;

use App\Domain\Teachers\Teacher;
use App\Domain\Teachers\TeacherId;

interface TeacherRepository
{
    public function find(TeacherId $id): ?Teacher;

    public function save(Teacher $teacher): void;
}

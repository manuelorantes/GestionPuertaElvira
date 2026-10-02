<?php

declare(strict_types=1);

namespace App\Application\Students\Port;

use App\Domain\Students\Student;
use App\Domain\Students\StudentId;

interface StudentRepository
{
    public function find(StudentId $id): ?Student;

    public function save(Student $student): void;
}

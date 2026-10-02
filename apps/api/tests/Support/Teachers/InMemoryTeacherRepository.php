<?php

declare(strict_types=1);

namespace App\Tests\Support\Teachers;

use App\Application\Teachers\Port\TeacherRepository;
use App\Domain\Teachers\Teacher;
use App\Domain\Teachers\TeacherId;

final class InMemoryTeacherRepository implements TeacherRepository
{
    /** @var array<string, Teacher> */
    public array $teachers = [];

    public function find(TeacherId $id): ?Teacher
    {
        return $this->teachers[$id->value] ?? null;
    }

    public function save(Teacher $teacher): void
    {
        $this->teachers[$teacher->id()->value] = $teacher;
    }
}

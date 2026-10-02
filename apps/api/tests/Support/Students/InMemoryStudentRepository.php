<?php

declare(strict_types=1);

namespace App\Tests\Support\Students;

use App\Application\Students\Port\StudentRepository;
use App\Domain\Students\Student;
use App\Domain\Students\StudentId;

final class InMemoryStudentRepository implements StudentRepository
{
    /** @var array<string, Student> */
    public array $students = [];

    public function find(StudentId $id): ?Student
    {
        return $this->students[$id->value] ?? null;
    }

    public function save(Student $student): void
    {
        $this->students[$student->id()->value] = $student;
    }
}

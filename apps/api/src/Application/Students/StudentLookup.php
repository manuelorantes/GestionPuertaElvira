<?php

declare(strict_types=1);

namespace App\Application\Students;

use App\Application\Students\Error\StudentNotFound;
use App\Application\Students\Port\StudentRepository;
use App\Domain\Students\Student;
use App\Domain\Students\StudentId;

final readonly class StudentLookup
{
    public static function byId(StudentRepository $students, string $id): Student
    {
        return $students->find(StudentId::fromString($id)) ?? throw new StudentNotFound();
    }
}

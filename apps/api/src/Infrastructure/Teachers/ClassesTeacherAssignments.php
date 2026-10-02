<?php

declare(strict_types=1);

namespace App\Infrastructure\Teachers;

use App\Application\Classes\Port\ClassGroupRepository;
use App\Application\Teachers\Port\TeacherAssignments;
use App\Domain\Classes\ClassGroup;
use App\Domain\Teachers\TeacherId;

/** Profesorado pregunta a Clases cuántos grupos tiene un profesor. */
final readonly class ClassesTeacherAssignments implements TeacherAssignments
{
    public function __construct(private ClassGroupRepository $groups)
    {
    }

    public function groupCount(TeacherId $teacherId): int
    {
        return \count(array_filter($this->groups->all(), static fn (ClassGroup $group): bool => $group->details()->teacher->value === $teacherId->value));
    }
}

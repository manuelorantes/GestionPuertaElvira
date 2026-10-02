<?php

declare(strict_types=1);

namespace App\Infrastructure\Classes;

use App\Application\Classes\Port\TeacherDirectory;
use App\Application\Teachers\Port\TeacherRepository;
use App\Domain\Classes\TeacherReference;
use App\Domain\Teachers\TeacherId;

/** Clases pregunta a Profesorado si un profesor está activo. */
final readonly class TeachersTeacherDirectory implements TeacherDirectory
{
    public function __construct(private TeacherRepository $teachers)
    {
    }

    public function isActive(TeacherReference $teacher): bool
    {
        return $this->teachers->find(TeacherId::fromString($teacher->value))?->isActive() ?? false;
    }
}

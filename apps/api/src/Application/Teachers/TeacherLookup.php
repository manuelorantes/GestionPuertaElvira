<?php

declare(strict_types=1);

namespace App\Application\Teachers;

use App\Application\Teachers\Error\TeacherNotFound;
use App\Application\Teachers\Port\TeacherRepository;
use App\Domain\Teachers\Teacher;
use App\Domain\Teachers\TeacherId;

final readonly class TeacherLookup
{
    public static function byId(TeacherRepository $teachers, string $id): Teacher
    {
        return $teachers->find(TeacherId::fromString($id)) ?? throw new TeacherNotFound();
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Teachers;

use App\Application\Teachers\Port\TeacherRepository;

final readonly class ActivateTeacher
{
    public function __construct(private TeacherRepository $teachers)
    {
    }

    public function __invoke(string $id): void
    {
        $teacher = TeacherLookup::byId($this->teachers, $id);
        $teacher->activate();
        $this->teachers->save($teacher);
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Teachers;

use App\Application\Teachers\Error\TeacherHasGroups;
use App\Application\Teachers\Port\TeacherAssignments;
use App\Application\Teachers\Port\TeacherRepository;

final readonly class DeactivateTeacher
{
    public function __construct(private TeacherRepository $teachers, private TeacherAssignments $assignments)
    {
    }

    /** @throws TeacherHasGroups */
    public function __invoke(string $id): void
    {
        $teacher = TeacherLookup::byId($this->teachers, $id);
        $groups = $this->assignments->groupCount($teacher->id());
        if ($groups > 0) {
            throw new TeacherHasGroups($groups);
        }

        $teacher->deactivate();
        $this->teachers->save($teacher);
    }
}

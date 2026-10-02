<?php

declare(strict_types=1);

namespace App\Application\Classes;

use App\Application\Classes\Error\ClassroomConflict;
use App\Application\Classes\Error\TeacherNotAvailable;
use App\Application\Classes\Port\ClassGroupRepository;
use App\Application\Classes\Port\TeacherDirectory;
use App\Domain\Classes\ClassGroupId;
use App\Domain\Classes\ClassroomSchedule;
use App\Domain\Classes\GroupDetails;

/**
 * Reglas comunes al crear y editar un grupo: profesor activo y aula libre.
 */
final readonly class GroupDetailsGuard
{
    public function __construct(private ClassGroupRepository $groups, private TeacherDirectory $teachers)
    {
    }

    public function assertAcceptable(ClassGroupId $id, GroupDetails $details): void
    {
        if (!$this->teachers->isActive($details->teacher)) {
            throw new TeacherNotAvailable();
        }

        $conflicts = new ClassroomSchedule()->conflictsFor($id, $details, $this->groups->all());
        if ([] !== $conflicts) {
            throw new ClassroomConflict($conflicts[0]);
        }
    }
}

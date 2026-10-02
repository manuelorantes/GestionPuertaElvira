<?php

declare(strict_types=1);

namespace App\Domain\Classes;

use App\Domain\Classes\Error\AlreadyEnrolled;
use App\Domain\Classes\Error\GroupFull;
use App\Domain\Classes\Error\StudentScheduleOverlap;

/**
 * Reglas para inscribir a un alumno en un grupo.
 */
final readonly class EnrolmentPolicy
{
    /**
     * @param list<ClassGroup> $studentGroups grupos en los que el alumno ya está inscrito
     */
    public function assertCanEnrol(ClassGroup $target, array $studentGroups, int $occupied, OverCapacity $overCapacity): void
    {
        foreach ($studentGroups as $group) {
            if ($group->id()->equals($target->id())) {
                throw new AlreadyEnrolled();
            }
            if ($group->details()->slot->overlaps($target->details()->slot)) {
                throw new StudentScheduleOverlap($group);
            }
        }

        $capacity = $target->details()->capacity->value;
        if ($occupied >= $capacity && OverCapacity::NotConfirmed === $overCapacity) {
            throw new GroupFull($occupied, $capacity);
        }
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Classes;

/**
 * Evita dos grupos en la misma aula a la misma hora.
 */
final readonly class ClassroomSchedule
{
    /**
     * @param list<ClassGroup> $existing
     *
     * @return list<ClassGroup> grupos (distintos del propuesto) que coinciden en aula, día y hora
     */
    public function conflictsFor(ClassGroupId $proposedId, GroupDetails $proposed, array $existing): array
    {
        return array_values(array_filter(
            $existing,
            static fn (ClassGroup $group): bool => !$group->id()->equals($proposedId) && $proposed->clashesWith($group->details()),
        ));
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Classes;

/**
 * Datos editables de un grupo; cada parte ya viene validada por su value object.
 */
final readonly class GroupDetails
{
    public function __construct(
        public GroupName $name,
        public Level $level,
        public TeacherReference $teacher,
        public WeeklySlot $slot,
        public Classroom $classroom,
        public Capacity $capacity,
    ) {
    }

    public function weeklyPlan(): WeeklyPlan
    {
        return WeeklyPlan::for($this->level, $this->slot);
    }

    public function clashesWith(self $other): bool
    {
        return $this->classroom->equals($other->classroom) && $this->slot->overlaps($other->slot);
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Payroll;

/** Grupo del horario: profesor, días ISO (1 = lunes) y duración de cada sesión. */
final readonly class ScheduledGroup
{
    /** @param list<int> $weekdays */
    public function __construct(
        public GroupRef $id,
        public string $name,
        public TeacherRef $teacher,
        public array $weekdays,
        public int $minutes,
    ) {
    }
}

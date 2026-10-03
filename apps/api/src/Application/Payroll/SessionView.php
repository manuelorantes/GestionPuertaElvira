<?php

declare(strict_types=1);

namespace App\Application\Payroll;

/** Fila del registro de horas. */
final readonly class SessionView
{
    public function __construct(
        public string $id,
        public string $date,
        public string $teacherId,
        public string $teacherName,
        public ?string $groupId,
        public string $label,
        public int $minutes,
        public int $costCents,
        public bool $fromSchedule,
        public bool $locked,
    ) {
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Classes;

final readonly class GroupSummary
{
    /** @param list<string> $days */
    public function __construct(
        public string $id,
        public string $name,
        public string $level,
        public string $teacherId,
        public string $teacherName,
        public array $days,
        public string $start,
        public string $end,
        public string $slotLabel,
        public int $classroom,
        public int $capacity,
        public int $occupied,
        public string $weeklyPlan,
    ) {
    }
}

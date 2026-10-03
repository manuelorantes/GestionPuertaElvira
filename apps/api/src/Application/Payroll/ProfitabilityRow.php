<?php

declare(strict_types=1);

namespace App\Application\Payroll;

final readonly class ProfitabilityRow
{
    /** @param list<string> $groups */
    public function __construct(
        public string $teacherId,
        public string $teacherName,
        public array $groups,
        public int $minutes,
        public int $rateCents,
        public int $costCents,
        public int $incomeCents,
        public int $marginCents,
        public ?int $incomePerHourCents,
        public int $occupied,
        public int $capacity,
    ) {
    }
}

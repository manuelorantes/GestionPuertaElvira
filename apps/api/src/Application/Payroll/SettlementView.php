<?php

declare(strict_types=1);

namespace App\Application\Payroll;

final readonly class SettlementView
{
    /** @param list<array{label: string, minutes: int, amountCents: int}> $lines */
    public function __construct(
        public string $teacherId,
        public string $teacherName,
        public string $month,
        public int $minutes,
        public int $rateCents,
        public int $amountCents,
        public array $lines,
        public string $status,
        public ?string $paidOn,
    ) {
    }
}

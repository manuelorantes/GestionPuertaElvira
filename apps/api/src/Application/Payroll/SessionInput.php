<?php

declare(strict_types=1);

namespace App\Application\Payroll;

final readonly class SessionInput
{
    public function __construct(
        public string $teacherId,
        public string $date,
        public ?string $groupId,
        public ?string $activity,
        public float $hours,
    ) {
    }
}

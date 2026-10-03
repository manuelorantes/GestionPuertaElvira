<?php

declare(strict_types=1);

namespace App\Application\Billing;

final readonly class PaymentRequest
{
    public function __construct(
        public string $studentId,
        public string $kind,
        public int $months,
        public string $method,
        public string $date,
        public bool $prorate,
        public ?int $specialPercent,
        public ?string $specialConcept,
    ) {
    }
}

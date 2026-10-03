<?php

declare(strict_types=1);

namespace App\Application\Billing;

final readonly class PaymentSummary
{
    public function __construct(
        public string $id,
        public string $receiptNumber,
        public string $paidOn,
        public string $studentId,
        public string $studentName,
        public string $kind,
        public string $concept,
        public string $method,
        public int $totalCents,
        public ?string $invoiceNumber,
    ) {
    }
}

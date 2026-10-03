<?php

declare(strict_types=1);

namespace App\Application\Billing;

/** Fila de «Cuotas del mes». */
final readonly class ChargeView
{
    public function __construct(
        public string $id,
        public string $studentId,
        public string $studentName,
        public string $guardianName,
        public string $guardianPhone,
        public string $kind,
        public string $period,
        public int $amountCents,
        public string $status,
        public ?string $paymentId,
        public ?string $receiptNumber,
        public ?string $remindedOn,
    ) {
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Billing;

/** Todo lo que necesita el recibo (y la factura, si existe). */
final readonly class PaymentDetail
{
    /**
     * @param list<array{label: string, amountCents: int}> $lines
     * @param list<string>                                 $periods
     * @param array<string, mixed>|null                    $invoice
     */
    public function __construct(
        public PaymentSummary $summary,
        public string $guardianName,
        public array $lines,
        public array $periods,
        public ?array $invoice,
    ) {
    }
}

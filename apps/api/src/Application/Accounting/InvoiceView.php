<?php

declare(strict_types=1);

namespace App\Application\Accounting;

final readonly class InvoiceView
{
    public function __construct(
        public string $id,
        public string $date,
        public string $number,
        public string $supplier,
        public string $concept,
        public string $category,
        public int $amountCents,
        public ?string $paidOn,
        public ?string $method,
        public ?string $attachmentName,
    ) {
    }
}

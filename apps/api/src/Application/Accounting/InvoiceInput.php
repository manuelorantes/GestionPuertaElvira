<?php

declare(strict_types=1);

namespace App\Application\Accounting;

final readonly class InvoiceInput
{
    public function __construct(
        public string $date,
        public string $number,
        public string $supplier,
        public string $concept,
        public string $category,
        public string $amount,
    ) {
    }
}

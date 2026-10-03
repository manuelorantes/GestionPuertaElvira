<?php

declare(strict_types=1);

namespace App\Application\Accounting;

/** Un movimiento del libro; `source` indica de dónde sale (payment, settlement, invoice, manual). */
final readonly class LedgerLine
{
    public function __construct(
        public string $source,
        public string $sourceId,
        public string $date,
        public string $kind,
        public string $concept,
        public string $category,
        public string $method,
        public int $amountCents,
    ) {
    }
}

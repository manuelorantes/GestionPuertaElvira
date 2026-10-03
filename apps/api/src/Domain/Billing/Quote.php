<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Common\Money;

/** Desglose de un cobro: las líneas siempre suman exactamente el total. */
final readonly class Quote
{
    /** @param list<QuoteLine> $lines */
    public function __construct(
        public array $lines,
        public Money $gross,
        public int $discountPercent,
        public Money $total,
        public Money $monthlyBase,
    ) {
    }
}

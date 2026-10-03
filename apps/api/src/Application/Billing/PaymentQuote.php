<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\Quote;
use App\Domain\Billing\YearMonth;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;

/** Cotización de un cobro: desglose, meses que cubre y concepto del recibo. */
final readonly class PaymentQuote
{
    /** @param list<YearMonth> $periods */
    public function __construct(
        public BillingStudent $student,
        public ChargeKind $kind,
        public LocalDate $date,
        public Quote $quote,
        public array $periods,
        public string $concept,
        public Money $monthlyCharge,
    ) {
    }
}

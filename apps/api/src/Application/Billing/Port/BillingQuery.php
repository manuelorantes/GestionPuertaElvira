<?php

declare(strict_types=1);

namespace App\Application\Billing\Port;

use App\Application\Billing\ChargeView;
use App\Application\Billing\PaymentDetail;
use App\Application\Billing\PaymentSummary;
use App\Domain\Billing\YearMonth;
use App\Domain\Common\LocalDate;

interface BillingQuery
{
    /**
     * Cuotas mensuales del mes y cuotas de socio de su temporada, con su estado a fecha de hoy.
     *
     * @return list<ChargeView>
     */
    public function charges(YearMonth $month, LocalDate $today): array;

    /**
     * Cobros, del más reciente al más antiguo; de un alumno si se indica.
     *
     * @return list<PaymentSummary>
     */
    public function payments(?string $studentId): array;

    public function payment(string $id): ?PaymentDetail;
}

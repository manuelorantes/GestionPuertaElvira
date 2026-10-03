<?php

declare(strict_types=1);

namespace App\Application\Billing\Port;

use App\Domain\Billing\Charge;
use App\Domain\Billing\ChargeId;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\YearMonth;

interface ChargeRepository
{
    public function charge(ChargeId $id): ?Charge;

    public function chargeFor(StudentRef $student, ChargeKind $kind, YearMonth $period): ?Charge;

    /**
     * Cuotas sin pagar, de la más antigua a la más reciente.
     *
     * @return list<Charge>
     */
    public function unpaidFor(StudentRef $student, ChargeKind $kind): array;

    public function latestMonthlyPeriod(StudentRef $student): ?YearMonth;

    public function saveCharge(Charge $charge): void;
}

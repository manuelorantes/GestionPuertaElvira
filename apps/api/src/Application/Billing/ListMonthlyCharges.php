<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Application\Billing\Port\BillingQuery;
use App\Domain\Billing\ChargeStatus;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;

/** Genera las cuotas que falten del mes y las devuelve con su estado y totales. */
final readonly class ListMonthlyCharges
{
    public function __construct(private GenerateMonthlyCharges $generate, private BillingQuery $query, private Clock $clock)
    {
    }

    public function __invoke(?string $month): MonthlyCharges
    {
        $today = LocalDate::fromInstant($this->clock->now());
        $period = null === $month || '' === $month ? YearMonth::of($today) : YearMonth::fromString($month);
        ($this->generate)($period->toString());

        $items = $this->query->charges($period, $today);
        $sum = static fn (array $charges): int => array_sum(array_column($charges, 'amountCents'));
        $paid = array_filter($items, static fn (ChargeView $c): bool => ChargeStatus::Paid->value === $c->status);
        $overdue = array_filter($items, static fn (ChargeView $c): bool => ChargeStatus::Overdue->value === $c->status);

        return new MonthlyCharges($period->toString(), $items, $sum($items), $sum($paid), \count($overdue));
    }
}

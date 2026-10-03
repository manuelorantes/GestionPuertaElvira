<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Billing\Error\InvalidPaymentRequest;
use App\Domain\Common\Money;

/**
 * Cálculo de la cuota (ver specs/features/cobros/spec.md):
 * tramo por horas semanales + particulares, con descuentos sumados sobre el bruto.
 */
final readonly class FeeCalculator
{
    public const int MAX_MONTHS = 10;

    public function quote(FeeProfile $profile, BillingSettings $settings, int $months, ?SpecialDiscount $special = null, ?Proration $proration = null): Quote
    {
        if ($months < 1 || $months > self::MAX_MONTHS) {
            throw InvalidPaymentRequest::months();
        }
        if (null !== $proration && 1 !== $months) {
            throw InvalidPaymentRequest::prorationRequiresOneMonth();
        }

        $tariff = $settings->tariff;
        $tier = $tariff->forWeeklyHours($profile->regularWeeklyHours);
        $monthlyBase = array_reduce($profile->privateLessons, static fn (Money $sum, PrivateLesson $l): Money => $sum->plus($l->monthlyPrice()), $tier);

        $lines = [];
        if ($tier->cents > 0) {
            $lines[] = new QuoteLine(self::hours($profile->regularWeeklyHours).' semanales · '.self::monthsLabel($months), $tier->times($months));
        }
        foreach ($profile->privateLessons as $lesson) {
            $lines[] = new QuoteLine(\sprintf('%s · %s/mes × %s%s', $lesson->groupName, self::hours($lesson->monthlyHours()), $lesson->hourlyRate->format(), $months > 1 ? ' · '.self::monthsLabel($months) : ''), $lesson->monthlyPrice()->times($months));
        }

        $gross = $monthlyBase->times($months);
        if (null !== $proration) {
            $prorated = $monthlyBase->times($proration->remainingDays() / $proration->daysInMonth);
            $lines[] = new QuoteLine(\sprintf('Prorrateo del %d al %d (%d de %d días)', $proration->fromDay, $proration->daysInMonth, $proration->remainingDays(), $proration->daysInMonth), $prorated->minus($gross));
            $gross = $prorated;
        }

        $discounts = [];
        if ($profile->hasSiblings && $tariff->familyPercent > 0) {
            $discounts[] = ['Descuento familiar', $tariff->familyPercent];
        }
        $prepayment = $tariff->prepaymentPercent($months);
        if ($prepayment > 0) {
            $discounts[] = [\sprintf('Pago adelantado %d meses', $months), $prepayment];
        }
        if (null !== $special) {
            $discounts[] = [$special->concept, $special->percent];
        }

        $percent = min(100, array_sum(array_column($discounts, 1)));
        $total = $gross->percent(100 - $percent);
        $lines = [...$lines, ...self::discountLines($discounts, $gross, $gross->minus($total))];

        return new Quote($lines, $gross, $percent, $total, $monthlyBase);
    }

    /**
     * Cobro de importes ya fijados (cuotas pendientes con su importe guardado y meses nuevos con el de hoy):
     * el descuento familiar ya va dentro de cada importe; se suman el de pago adelantado y el especial.
     *
     * @param non-empty-list<QuoteLine> $items
     */
    public function quoteItems(array $items, BillingSettings $settings, ?SpecialDiscount $special = null): Quote
    {
        $months = \count($items);
        if ($months > self::MAX_MONTHS) {
            throw InvalidPaymentRequest::months();
        }
        $gross = array_reduce($items, static fn (Money $sum, QuoteLine $l): Money => $sum->plus($l->amount), Money::zero());
        $discounts = [];
        $prepayment = $settings->tariff->prepaymentPercent($months);
        if ($prepayment > 0) {
            $discounts[] = [\sprintf('Pago adelantado %d meses', $months), $prepayment];
        }
        if (null !== $special) {
            $discounts[] = [$special->concept, $special->percent];
        }
        $percent = min(100, array_sum(array_column($discounts, 1)));
        $total = $gross->percent(100 - $percent);

        return new Quote([...$items, ...self::discountLines($discounts, $gross, $gross->minus($total))], $gross, $percent, $total, $items[0]->amount);
    }

    /**
     * Una línea por descuento; la última absorbe el redondeo para que todo sume el total exacto.
     *
     * @param list<array{0: string, 1: int}> $discounts
     *
     * @return list<QuoteLine>
     */
    private static function discountLines(array $discounts, Money $gross, Money $totalDiscount): array
    {
        $lines = [];
        $applied = Money::zero();
        foreach ($discounts as $index => [$label, $percent]) {
            $amount = $index === array_key_last($discounts) ? $totalDiscount->minus($applied) : $gross->percent($percent);
            $applied = $applied->plus($amount);
            $lines[] = new QuoteLine(\sprintf('%s −%d %%', $label, $percent), Money::cents(-$amount->cents));
        }

        return $lines;
    }

    private static function hours(float $hours): string
    {
        return str_replace('.', ',', (string) round($hours, 2)).' h';
    }

    private static function monthsLabel(int $months): string
    {
        return 1 === $months ? '1 mes' : $months.' meses';
    }
}

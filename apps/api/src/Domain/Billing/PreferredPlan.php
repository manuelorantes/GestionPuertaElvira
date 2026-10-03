<?php

declare(strict_types=1);

namespace App\Domain\Billing;

/** Forma de pago preferida: solo propone cuántos meses cobrar. */
enum PreferredPlan: string
{
    case Monthly = 'monthly';
    case ThreeMonths = 'three_months';
    case SixMonths = 'six_months';
    case RestOfSeason = 'rest_of_season';

    public function monthsWithin(int $remaining): int
    {
        return max(1, min($remaining, match ($this) {
            self::Monthly => 1,
            self::ThreeMonths => 3,
            self::SixMonths => 6,
            self::RestOfSeason => $remaining,
        }));
    }
}

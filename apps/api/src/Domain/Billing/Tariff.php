<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Common\InvalidValue;
use App\Domain\Common\Money;

/** Precios y descuentos de la temporada. */
final readonly class Tariff
{
    public function __construct(
        public Money $threeHours,
        public Money $twoHours,
        public Money $hourAndHalf,
        public Money $oneHour,
        public Money $membershipFee,
        public int $familyPercent,
        public int $threeMonthsPercent,
        public int $sixMonthsPercent,
        public int $seasonPercent,
    ) {
        foreach ([$threeHours, $twoHours, $hourAndHalf, $oneHour, $membershipFee] as $price) {
            if ($price->isNegative()) {
                throw new InvalidValue('tariff', 'Los precios no pueden ser negativos.');
            }
        }
        foreach ([$familyPercent, $threeMonthsPercent, $sixMonthsPercent, $seasonPercent] as $percent) {
            if ($percent < 0 || $percent > 100) {
                throw new InvalidValue('tariff', 'Los descuentos deben estar entre 0 y 100 %.');
            }
        }
    }

    public static function defaults(): self
    {
        return new self(Money::euros(55), Money::euros(45), Money::euros(40), Money::euros(35), Money::euros(50), 10, 10, 15, 20);
    }

    /** Tramo por horas semanales de grupos normales. */
    public function forWeeklyHours(float $hours): Money
    {
        return match (true) {
            $hours <= 0 => Money::zero(),
            $hours >= 3 => $this->threeHours,
            $hours >= 2 => $this->twoHours,
            $hours >= 1.5 => $this->hourAndHalf,
            default => $this->oneHour,
        };
    }

    /** Descuento por pago adelantado según los meses cubiertos. */
    public function prepaymentPercent(int $months): int
    {
        return match (true) {
            $months >= 7 => $this->seasonPercent,
            $months >= 6 => $this->sixMonthsPercent,
            $months >= 3 => $this->threeMonthsPercent,
            default => 0,
        };
    }
}

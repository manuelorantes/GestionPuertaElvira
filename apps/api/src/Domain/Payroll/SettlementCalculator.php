<?php

declare(strict_types=1);

namespace App\Domain\Payroll;

use App\Domain\Common\Money;

/** Liquidación = horas × tarifa, redondeada a céntimos, con el detalle por grupo o actividad. */
final readonly class SettlementCalculator
{
    /** @param list<TimesheetEntry> $entries */
    public function settle(array $entries, Money $rate): Settlement
    {
        $byLabel = [];
        foreach ($entries as $entry) {
            $byLabel[$entry->label()] = ($byLabel[$entry->label()] ?? 0) + $entry->minutes()->minutes;
        }

        $minutes = array_sum($byLabel);
        $amount = $rate->times($minutes / 60);
        $lines = [];
        $assigned = Money::zero();
        $last = array_key_last($byLabel);
        foreach ($byLabel as $label => $labelMinutes) {
            $lineAmount = $label === $last ? $amount->minus($assigned) : $rate->times($labelMinutes / 60);
            $assigned = $assigned->plus($lineAmount);
            $lines[] = new SettlementLine((string) $label, $labelMinutes, $lineAmount);
        }

        return new Settlement($minutes, $rate, $amount, $lines);
    }
}

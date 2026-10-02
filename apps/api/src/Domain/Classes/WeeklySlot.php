<?php

declare(strict_types=1);

namespace App\Domain\Classes;

use App\Domain\Common\InvalidValue;

/**
 * Franja semanal de un grupo: unos días de lunes a viernes, de una hora a otra.
 */
final readonly class WeeklySlot
{
    /** @param list<Weekday> $days */
    private function __construct(private array $days, public HalfHour $start, public HalfHour $end)
    {
    }

    /** @param list<Weekday> $days */
    public static function of(array $days, HalfHour $start, HalfHour $end): self
    {
        $unique = array_values(array_unique($days, \SORT_REGULAR));
        usort($unique, static fn (Weekday $a, Weekday $b): int => $a->value <=> $b->value);

        if ([] === $unique) {
            throw new InvalidValue('days', 'Elige al menos un día.');
        }
        if (!$start->isBefore($end)) {
            throw new InvalidValue('end', 'La hora de fin debe ser posterior a la de inicio.');
        }

        return new self($unique, $start, $end);
    }

    /** @return list<Weekday> */
    public function days(): array
    {
        return $this->days;
    }

    public function overlaps(self $other): bool
    {
        $sharesDay = [] !== array_uintersect($this->days, $other->days, static fn (Weekday $a, Weekday $b): int => $a->value <=> $b->value);

        return $sharesDay && $this->start->isBefore($other->end) && $other->start->isBefore($this->end);
    }

    public function weeklyHours(): float
    {
        return ($this->end->minutes - $this->start->minutes) / 60 * \count($this->days);
    }

    public function label(): string
    {
        $labels = array_map(static fn (Weekday $day): string => $day->shortLabel(), $this->days);
        $last = array_pop($labels);
        $days = [] === $labels ? $last : implode(', ', $labels).' y '.$last;

        return \sprintf('%s · %s–%s', $days, $this->start->toString(), $this->end->toString());
    }
}

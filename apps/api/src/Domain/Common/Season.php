<?php

declare(strict_types=1);

namespace App\Domain\Common;

/**
 * Temporada del club: de septiembre a junio. Julio y agosto no tienen clases.
 */
final readonly class Season
{
    private function __construct(public int $startYear)
    {
    }

    /** Temporada a la que pertenece un mes; julio y agosto cuentan para la que empieza en septiembre. */
    public static function containing(YearMonth $month): self
    {
        return new self($month->month >= 7 ? $month->year : $month->year - 1);
    }

    /** Temporada con clases en ese mes, o null en julio y agosto. */
    public static function teachingSeason(YearMonth $month): ?self
    {
        return \in_array($month->month, [7, 8], true) ? null : self::containing($month);
    }

    public function firstMonth(): YearMonth
    {
        return YearMonth::fromString(\sprintf('%04d-09', $this->startYear));
    }

    public function lastMonth(): YearMonth
    {
        return YearMonth::fromString(\sprintf('%04d-06', $this->startYear + 1));
    }

    public function includes(YearMonth $month): bool
    {
        return !$month->isBefore($this->firstMonth()) && !$this->lastMonth()->isBefore($month);
    }

    /** Meses de clase desde `$month` (incluido) hasta junio. */
    public function monthsFrom(YearMonth $month): int
    {
        $count = 0;
        for ($current = $month; !$this->lastMonth()->isBefore($current); $current = $current->next()) {
            ++$count;
        }

        return $count;
    }

    public function label(): string
    {
        return \sprintf('%d/%02d', $this->startYear, ($this->startYear + 1) % 100);
    }
}

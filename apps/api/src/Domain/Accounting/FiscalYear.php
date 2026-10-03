<?php

declare(strict_types=1);

namespace App\Domain\Accounting;

use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;

/** Ejercicio contable del club: de septiembre a agosto. */
final readonly class FiscalYear
{
    public function __construct(public int $startYear)
    {
    }

    public static function of(LocalDate $date): self
    {
        return self::ofMonth(YearMonth::of($date));
    }

    public static function ofMonth(YearMonth $month): self
    {
        return new self($month->month >= 9 ? $month->year : $month->year - 1);
    }

    /** @return list<YearMonth> de septiembre a agosto */
    public function months(): array
    {
        $months = [];
        for ($month = $this->firstMonth(), $i = 0; $i < 12; $month = $month->next(), ++$i) {
            $months[] = $month;
        }

        return $months;
    }

    public function firstMonth(): YearMonth
    {
        return YearMonth::fromString(\sprintf('%04d-09', $this->startYear));
    }

    public function lastMonth(): YearMonth
    {
        return YearMonth::fromString(\sprintf('%04d-08', $this->startYear + 1));
    }

    public function includes(LocalDate $date): bool
    {
        return self::of($date)->equals($this);
    }

    public function previous(): self
    {
        return new self($this->startYear - 1);
    }

    public function equals(self $other): bool
    {
        return $this->startYear === $other->startYear;
    }

    public function label(): string
    {
        return \sprintf('%d/%02d', $this->startYear, ($this->startYear + 1) % 100);
    }
}

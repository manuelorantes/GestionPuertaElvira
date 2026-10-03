<?php

declare(strict_types=1);

namespace App\Domain\Accounting;

use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;

/** Cierre de un ejercicio: congela ingresos, gastos y resultado, que pasa como saldo inicial del siguiente. */
final readonly class SeasonClosing
{
    private function __construct(private FiscalYear $year, private Money $income, private Money $expenses, private LocalDate $closedOn)
    {
    }

    public static function close(FiscalYear $year, Money $income, Money $expenses, LocalDate $closedOn): self
    {
        return new self($year, $income, $expenses, $closedOn);
    }

    public function year(): FiscalYear
    {
        return $this->year;
    }

    public function income(): Money
    {
        return $this->income;
    }

    public function expenses(): Money
    {
        return $this->expenses;
    }

    public function result(): Money
    {
        return $this->income->minus($this->expenses);
    }

    public function closedOn(): LocalDate
    {
        return $this->closedOn;
    }
}

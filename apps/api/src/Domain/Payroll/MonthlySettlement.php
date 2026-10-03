<?php

declare(strict_types=1);

namespace App\Domain\Payroll;

use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;

/** Liquidación pagada de un profesor y mes: congela horas, tarifa, importe y detalle. */
final readonly class MonthlySettlement
{
    public function __construct(
        public TeacherRef $teacher,
        public YearMonth $month,
        public Settlement $settlement,
        public LocalDate $paidOn,
    ) {
    }
}

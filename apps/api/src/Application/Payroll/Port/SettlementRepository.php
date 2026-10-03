<?php

declare(strict_types=1);

namespace App\Application\Payroll\Port;

use App\Domain\Common\YearMonth;
use App\Domain\Payroll\MonthlySettlement;
use App\Domain\Payroll\TeacherRef;

interface SettlementRepository
{
    public function settlement(TeacherRef $teacher, YearMonth $month): ?MonthlySettlement;

    /** @return list<MonthlySettlement> */
    public function settlementsOf(YearMonth $month): array;

    public function saveSettlement(MonthlySettlement $settlement): void;
}

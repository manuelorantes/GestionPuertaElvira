<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Application\Payroll\Port\SettlementRepository;
use App\Domain\Common\YearMonth;
use App\Domain\Payroll\Error\SettlementAlreadyPaid;
use App\Domain\Payroll\TeacherRef;

/** Las sesiones de una liquidación pagada no se tocan. */
final class SettlementGuard
{
    public static function ensureOpen(SettlementRepository $settlements, TeacherRef $teacher, YearMonth $month): void
    {
        if (null !== $settlements->settlement($teacher, $month)) {
            throw new SettlementAlreadyPaid();
        }
    }
}

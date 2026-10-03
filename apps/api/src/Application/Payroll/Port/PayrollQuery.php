<?php

declare(strict_types=1);

namespace App\Application\Payroll\Port;

use App\Application\Payroll\SessionView;
use App\Application\Payroll\TeacherActivity;
use App\Domain\Common\YearMonth;

interface PayrollQuery
{
    /**
     * Sesiones del mes, por fecha; el coste usa la tarifa congelada si la liquidación está pagada.
     *
     * @return list<SessionView>
     */
    public function sessions(YearMonth $month, ?string $teacherId): array;

    /**
     * Grupos, ocupación e ingresos atribuidos por profesor en el mes (claves: id de profesor).
     *
     * @return array<string, TeacherActivity>
     */
    public function activity(YearMonth $month): array;
}

<?php

declare(strict_types=1);

namespace App\Application\Payroll\Port;

use App\Application\Payroll\TeacherRate;

interface TeacherRates
{
    /** @return list<TeacherRate> */
    public function all(): array;
}

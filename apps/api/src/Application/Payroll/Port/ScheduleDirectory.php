<?php

declare(strict_types=1);

namespace App\Application\Payroll\Port;

use App\Domain\Payroll\ScheduledGroup;

interface ScheduleDirectory
{
    /** @return list<ScheduledGroup> */
    public function groups(): array;
}

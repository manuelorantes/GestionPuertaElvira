<?php

declare(strict_types=1);

namespace App\Domain\Payroll;

use App\Domain\Common\LocalDate;

final readonly class PlannedSession
{
    public function __construct(public ScheduledGroup $group, public LocalDate $date, public SessionMinutes $minutes)
    {
    }
}

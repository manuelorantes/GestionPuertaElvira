<?php

declare(strict_types=1);

namespace App\Application\Payroll\Port;

use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;
use App\Domain\Payroll\TimesheetEntry;
use App\Domain\Payroll\TimesheetEntryId;

interface TimesheetRepository
{
    public function entry(TimesheetEntryId $id): ?TimesheetEntry;

    public function save(TimesheetEntry $entry): void;

    public function delete(TimesheetEntryId $id): void;

    /** @return list<TimesheetEntry> */
    public function forMonth(YearMonth $month): array;

    /** @return list<TimesheetEntry> */
    public function onDate(LocalDate $date): array;
}

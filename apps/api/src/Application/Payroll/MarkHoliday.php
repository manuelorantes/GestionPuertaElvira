<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Application\Payroll\Port\SettlementRepository;
use App\Application\Payroll\Port\TimesheetRepository;
use App\Domain\Common\LocalDate;

/** Día festivo: quita sus sesiones, salvo las de liquidaciones ya pagadas. Devuelve cuántas quitó. */
final readonly class MarkHoliday
{
    public function __construct(private TimesheetRepository $timesheets, private SettlementRepository $settlements)
    {
    }

    public function __invoke(string $date): int
    {
        $removed = 0;
        foreach ($this->timesheets->onDate(LocalDate::fromString($date)) as $entry) {
            if (null === $this->settlements->settlement($entry->teacher(), $entry->month())) {
                $this->timesheets->delete($entry->id());
                ++$removed;
            }
        }

        return $removed;
    }
}

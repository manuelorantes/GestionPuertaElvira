<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Application\Payroll\Error\SessionNotFound;
use App\Application\Payroll\Port\SettlementRepository;
use App\Application\Payroll\Port\TimesheetRepository;
use App\Domain\Payroll\TimesheetEntryId;

final readonly class DeleteSession
{
    public function __construct(private TimesheetRepository $timesheets, private SettlementRepository $settlements)
    {
    }

    public function __invoke(string $id): void
    {
        $entry = $this->timesheets->entry(TimesheetEntryId::fromString($id)) ?? throw new SessionNotFound();
        SettlementGuard::ensureOpen($this->settlements, $entry->teacher(), $entry->month());
        $this->timesheets->delete($entry->id());
    }
}

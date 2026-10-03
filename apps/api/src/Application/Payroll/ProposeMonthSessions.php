<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Application\Common\Port\TransactionRunner;
use App\Application\Payroll\Port\ProposalLog;
use App\Application\Payroll\Port\ScheduleDirectory;
use App\Application\Payroll\Port\SettlementRepository;
use App\Application\Payroll\Port\TimesheetRepository;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;
use App\Domain\Payroll\SessionPlanner;
use App\Domain\Payroll\TimesheetEntry;
use App\Domain\Payroll\TimesheetEntryId;

/**
 * Propone, una sola vez por mes y nunca para meses futuros, las sesiones del horario.
 * Lo que administración borre después no vuelve a aparecer.
 */
final readonly class ProposeMonthSessions
{
    public function __construct(
        private ScheduleDirectory $schedule,
        private TimesheetRepository $timesheets,
        private SettlementRepository $settlements,
        private ProposalLog $log,
        private Clock $clock,
        private TransactionRunner $transactions,
    ) {
    }

    public function __invoke(string $month): void
    {
        $period = YearMonth::fromString($month);
        if (YearMonth::of(LocalDate::fromInstant($this->clock->now()))->isBefore($period) || $this->log->wasProposed($period)) {
            return;
        }

        $this->transactions->run(function () use ($period): void {
            foreach (new SessionPlanner()->plan($period, $this->schedule->groups()) as $session) {
                if (null !== $this->settlements->settlement($session->group->teacher, $period)) {
                    continue;
                }
                $this->timesheets->save(TimesheetEntry::record(TimesheetEntryId::generate(), $session->group->teacher, $session->date, $session->group->id, $session->group->name, $session->minutes, true));
            }
            $this->log->markProposed($period);
        });
    }
}

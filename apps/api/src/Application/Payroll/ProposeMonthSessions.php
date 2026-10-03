<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Application\Common\Port\Locks;
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
 * Propone, una sola vez por mes y solo para el mes en curso o el anterior, las sesiones del horario.
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
        private Locks $locks,
    ) {
    }

    public function __invoke(string $month): void
    {
        $period = YearMonth::fromString($month);
        $current = YearMonth::of(LocalDate::fromInstant($this->clock->now()));
        // Solo el mes en curso y el anterior (el que se liquida): un mes antiguo no se rellena con el horario de hoy.
        if (!$period->equals($current) && !$period->next()->equals($current)) {
            return;
        }

        $this->transactions->run(function () use ($period): void {
            $this->locks->acquire('payroll:proposal:'.$period->toString());
            if ($this->log->wasProposed($period)) {
                return;
            }
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

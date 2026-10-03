<?php

declare(strict_types=1);

namespace App\Application\Accounting;

use App\Application\Accounting\Error\PreviousSeasonOpen;
use App\Application\Accounting\Error\SeasonAlreadyClosed;
use App\Application\Accounting\Error\SeasonNotFinished;
use App\Application\Accounting\Port\SeasonClosingRepository;
use App\Domain\Accounting\FiscalYear;
use App\Domain\Accounting\SeasonClosing;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;

/** Cierra un ejercicio terminado (o en su último mes), en orden, congelando su resultado. */
final readonly class CloseSeason
{
    public function __construct(private FiscalYearSummary $summary, private SeasonClosingRepository $closings, private Clock $clock)
    {
    }

    public function __invoke(int $startYear): void
    {
        $year = new FiscalYear($startYear);
        if (null !== $this->closings->closing($year)) {
            throw new SeasonAlreadyClosed();
        }
        $view = ($this->summary)($startYear);
        if (!$view->canClose) {
            throw new SeasonNotFinished();
        }
        $previous = $year->previous();
        if (null === $this->closings->closing($previous) && $this->hasMovements($previous)) {
            throw new PreviousSeasonOpen();
        }

        $this->closings->saveClosing(SeasonClosing::close($year, Money::cents($view->incomeCents), Money::cents($view->expenseCents), LocalDate::fromInstant($this->clock->now())));
    }

    private function hasMovements(FiscalYear $year): bool
    {
        foreach ($year->months() as $month) {
            if ([0, 0] !== $this->summary->totals($month)) {
                return true;
            }
        }

        return false;
    }
}

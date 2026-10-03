<?php

declare(strict_types=1);

namespace App\Application\Accounting\Port;

use App\Domain\Accounting\FiscalYear;
use App\Domain\Accounting\SeasonClosing;

interface SeasonClosingRepository
{
    public function closing(FiscalYear $year): ?SeasonClosing;

    /** @return list<SeasonClosing> */
    public function closings(): array;

    public function saveClosing(SeasonClosing $closing): void;
}

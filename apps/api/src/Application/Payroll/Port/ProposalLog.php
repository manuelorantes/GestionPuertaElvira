<?php

declare(strict_types=1);

namespace App\Application\Payroll\Port;

use App\Domain\Common\YearMonth;

/** Meses cuyas sesiones ya se propusieron a partir del horario. */
interface ProposalLog
{
    public function wasProposed(YearMonth $month): bool;

    public function markProposed(YearMonth $month): void;
}

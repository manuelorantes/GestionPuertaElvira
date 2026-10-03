<?php

declare(strict_types=1);

namespace App\Application\Accounting\Port;

use App\Application\Accounting\LedgerLine;
use App\Domain\Common\YearMonth;

interface LedgerQuery
{
    /**
     * Movimientos del mes: cobros, liquidaciones pagadas, facturas pagadas y apuntes manuales.
     *
     * @return list<LedgerLine>
     */
    public function lines(YearMonth $month): array;
}

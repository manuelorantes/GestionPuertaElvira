<?php

declare(strict_types=1);

namespace App\Application\Common\Error;

use App\Application\Common\Port\ClosedPeriods;
use App\Domain\Common\LocalDate;
use RuntimeException;

final class PeriodClosed extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Esa fecha pertenece a una temporada cerrada: no se puede modificar.');
    }

    public static function guard(ClosedPeriods $periods, LocalDate $date): void
    {
        if ($periods->isClosed($date)) {
            throw new self();
        }
    }
}

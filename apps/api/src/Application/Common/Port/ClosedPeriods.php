<?php

declare(strict_types=1);

namespace App\Application\Common\Port;

use App\Domain\Common\LocalDate;

/** Ejercicios contables cerrados: nada con fecha dentro de ellos puede cambiar. */
interface ClosedPeriods
{
    public function isClosed(LocalDate $date): bool;
}

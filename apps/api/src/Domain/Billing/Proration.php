<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Common\InvalidValue;

/** Cobro parcial del primer mes: desde el día de alta hasta fin de mes. */
final readonly class Proration
{
    public function __construct(public int $fromDay, public int $daysInMonth)
    {
        if ($fromDay < 1 || $fromDay > $daysInMonth) {
            throw new InvalidValue('prorate', 'El día de inicio del prorrateo no es válido.');
        }
    }

    public function remainingDays(): int
    {
        return $this->daysInMonth - $this->fromDay + 1;
    }
}

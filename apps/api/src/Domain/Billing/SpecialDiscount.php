<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Common\InvalidValue;

/** Descuento puntual decidido al cobrar (p. ej. canje de puntos). */
final readonly class SpecialDiscount
{
    public function __construct(public int $percent, public string $concept)
    {
        if ($percent < 1 || $percent > 100) {
            throw new InvalidValue('specialDiscount', 'El descuento especial debe estar entre 1 y 100 %.');
        }
        if ('' === trim($concept)) {
            throw new InvalidValue('specialDiscount', 'Indica el motivo del descuento especial.');
        }
    }
}

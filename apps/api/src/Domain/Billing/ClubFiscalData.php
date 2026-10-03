<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Common\InvalidValue;

/** Datos del club que aparecen en recibos y facturas. */
final readonly class ClubFiscalData
{
    public function __construct(public string $name, public string $taxId, public string $address)
    {
        if ('' === trim($name) || '' === trim($taxId)) {
            throw new InvalidValue('fiscal', 'El nombre y el NIF del club son obligatorios.');
        }
    }

    public static function defaults(): self
    {
        return new self('Club Ajedrez Puerta Elvira', 'G00000000', 'Granada');
    }
}

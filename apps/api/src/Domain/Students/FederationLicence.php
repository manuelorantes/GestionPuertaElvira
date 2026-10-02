<?php

declare(strict_types=1);

namespace App\Domain\Students;

use App\Domain\Common\InvalidValue;

/** Número de licencia federativa; su presencia indica que el alumno está federado. */
final readonly class FederationLicence
{
    private function __construct(public string $value)
    {
    }

    public static function fromString(string $licence): self
    {
        $normalised = strtoupper(trim($licence));
        if (1 !== preg_match('/^[A-Z0-9\-]{3,20}$/', $normalised)) {
            throw new InvalidValue('federationLicence', 'La licencia federativa debe tener entre 3 y 20 letras, números o guiones.');
        }

        return new self($normalised);
    }
}

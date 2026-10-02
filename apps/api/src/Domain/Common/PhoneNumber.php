<?php

declare(strict_types=1);

namespace App\Domain\Common;

/**
 * Teléfono español (fijo o móvil): 9 dígitos que empiezan por 6, 7, 8 o 9; prefijo +34 opcional.
 */
final readonly class PhoneNumber
{
    private function __construct(public string $value)
    {
    }

    public static function fromString(string $phone): self
    {
        $digits = (string) preg_replace('/[\s\-().]/', '', $phone);
        $digits = (string) preg_replace('/^(\+34|0034)/', '', $digits);

        if (1 !== preg_match('/^[6-9]\d{8}$/', $digits)) {
            throw new InvalidValue('phone', 'El teléfono debe ser un número español de 9 cifras.');
        }

        return new self(\sprintf('%s %s %s %s', substr($digits, 0, 3), substr($digits, 3, 2), substr($digits, 5, 2), substr($digits, 7, 2)));
    }
}

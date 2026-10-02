<?php

declare(strict_types=1);

namespace App\Domain\Students;

use App\Domain\Common\InvalidValue;

/** DNI o NIE español con letra de control. */
final readonly class NationalId
{
    private const string LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

    private function __construct(public string $value)
    {
    }

    public static function fromString(string $id): self
    {
        $normalised = strtoupper((string) preg_replace('/[\s\-.]/', '', $id));
        if (1 !== preg_match('/^([XYZ]?)(\d{7,8})([A-Z])$/', $normalised, $parts) || ('' === $parts[1] && 8 !== \strlen($parts[2])) || ('' !== $parts[1] && 7 !== \strlen($parts[2]))) {
            throw self::invalid();
        }

        $number = (int) (strtr($parts[1], ['X' => '0', 'Y' => '1', 'Z' => '2']).$parts[2]);
        if (self::LETTERS[$number % 23] !== $parts[3]) {
            throw self::invalid();
        }

        return new self($normalised);
    }

    private static function invalid(): InvalidValue
    {
        return new InvalidValue('nationalId', 'El DNI o NIE no es válido.');
    }
}

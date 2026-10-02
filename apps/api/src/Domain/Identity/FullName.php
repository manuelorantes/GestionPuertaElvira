<?php

declare(strict_types=1);

namespace App\Domain\Identity;

use App\Domain\Common\InvalidValue;

final readonly class FullName
{
    private const int MIN_LENGTH = 2;
    private const int MAX_LENGTH = 120;

    private function __construct(public string $value)
    {
    }

    public static function fromString(string $name): self
    {
        $normalised = trim((string) preg_replace('/\s+/u', ' ', $name));
        $length = mb_strlen($normalised);

        if ($length < self::MIN_LENGTH || $length > self::MAX_LENGTH) {
            throw new InvalidValue('fullName', 'El nombre debe tener entre 2 y 120 caracteres.');
        }

        return new self($normalised);
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Classes;

use App\Domain\Common\InvalidValue;

final readonly class GroupName
{
    private function __construct(public string $value)
    {
    }

    public static function fromString(string $name): self
    {
        $normalised = trim((string) preg_replace('/\s+/u', ' ', $name));
        $length = mb_strlen($normalised);

        if ($length < 2 || $length > 60) {
            throw new InvalidValue('name', 'El nombre del grupo debe tener entre 2 y 60 caracteres.');
        }

        return new self($normalised);
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Classes;

use App\Domain\Common\InvalidValue;

final readonly class Capacity
{
    private function __construct(public int $value)
    {
    }

    public static function of(int $value): self
    {
        if ($value < 1 || $value > 30) {
            throw new InvalidValue('capacity', 'Las plazas deben estar entre 1 y 30.');
        }

        return new self($value);
    }
}

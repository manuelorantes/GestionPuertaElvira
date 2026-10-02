<?php

declare(strict_types=1);

namespace App\Domain\Classes;

use App\Domain\Common\InvalidValue;

final readonly class Classroom
{
    private function __construct(public int $number)
    {
    }

    public static function of(int $number): self
    {
        if (1 !== $number && 2 !== $number) {
            throw new InvalidValue('classroom', 'El club tiene las aulas 1 y 2.');
        }

        return new self($number);
    }

    public function equals(self $other): bool
    {
        return $this->number === $other->number;
    }
}

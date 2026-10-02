<?php

declare(strict_types=1);

namespace App\Domain\Classes;

use App\Domain\Common\InvalidValue;

enum Weekday: int
{
    case Monday = 1;
    case Tuesday = 2;
    case Wednesday = 3;
    case Thursday = 4;
    case Friday = 5;

    public static function fromName(string $name): self
    {
        foreach (self::cases() as $day) {
            if ($day->code() === $name) {
                return $day;
            }
        }

        throw new InvalidValue('days', 'Día no válido: usa mon, tue, wed, thu o fri.');
    }

    public function code(): string
    {
        return strtolower(substr($this->name, 0, 3));
    }

    public function shortLabel(): string
    {
        return ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'][$this->value - 1];
    }
}

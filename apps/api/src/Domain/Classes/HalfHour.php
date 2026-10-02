<?php

declare(strict_types=1);

namespace App\Domain\Classes;

use App\Domain\Common\InvalidValue;

/**
 * Hora en punto o y media dentro del horario del club (16:00–21:00).
 */
final readonly class HalfHour
{
    private const int OPENING = 16 * 60;
    private const int CLOSING = 21 * 60;

    private function __construct(public int $minutes)
    {
    }

    public static function fromString(string $time): self
    {
        if (1 !== preg_match('/^(\d{2}):(00|30)$/', $time, $parts)) {
            throw new InvalidValue('time', 'La hora debe ser en punto o y media (p. ej. 17:30).');
        }

        return self::fromMinutes((int) $parts[1] * 60 + (int) $parts[2]);
    }

    public static function fromMinutes(int $minutes): self
    {
        if ($minutes < self::OPENING || $minutes > self::CLOSING || 0 !== $minutes % 30) {
            throw new InvalidValue('time', 'Las clases son entre las 16:00 y las 21:00, en medias horas.');
        }

        return new self($minutes);
    }

    public function toString(): string
    {
        return \sprintf('%02d:%02d', intdiv($this->minutes, 60), $this->minutes % 60);
    }

    public function isBefore(self $other): bool
    {
        return $this->minutes < $other->minutes;
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Payroll;

use App\Domain\Common\InvalidValue;

/** Duración de una sesión: de media hora a 12 horas, en medias horas. */
final readonly class SessionMinutes
{
    private function __construct(public int $minutes)
    {
    }

    public static function fromMinutes(int $minutes): self
    {
        if ($minutes < 30 || $minutes > 720 || 0 !== $minutes % 30) {
            throw new InvalidValue('hours', 'Las horas van de 0,5 a 12, en medias horas.');
        }

        return new self($minutes);
    }

    public static function fromHours(float $hours): self
    {
        $minutes = $hours * 60;
        if ((float) (int) $minutes !== $minutes) {
            throw new InvalidValue('hours', 'Las horas van de 0,5 a 12, en medias horas.');
        }

        return self::fromMinutes((int) $minutes);
    }

    public function hours(): float
    {
        return $this->minutes / 60;
    }

    public function label(): string
    {
        return str_replace('.', ',', (string) $this->hours()).' h';
    }
}

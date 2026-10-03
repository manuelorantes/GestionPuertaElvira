<?php

declare(strict_types=1);

namespace App\Domain\Common;

use DateTimeImmutable;
use Stringable;

final readonly class YearMonth implements Stringable
{
    private const array MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    private function __construct(public int $year, public int $month)
    {
    }

    public static function fromString(string $value): self
    {
        if (1 !== preg_match('/^(\d{4})-(\d{2})$/', $value, $parts) || (int) $parts[2] < 1 || (int) $parts[2] > 12) {
            throw new InvalidValue('month', 'El mes debe tener el formato AAAA-MM.');
        }

        return new self((int) $parts[1], (int) $parts[2]);
    }

    public static function of(LocalDate $date): self
    {
        return self::fromString(substr($date->toString(), 0, 7));
    }

    public function next(): self
    {
        return 12 === $this->month ? new self($this->year + 1, 1) : new self($this->year, $this->month + 1);
    }

    public function isBefore(self $other): bool
    {
        return [$this->year, $this->month] < [$other->year, $other->month];
    }

    public function equals(self $other): bool
    {
        return $this->year === $other->year && $this->month === $other->month;
    }

    public function days(): int
    {
        return (int) new DateTimeImmutable(\sprintf('%04d-%02d-01', $this->year, $this->month))->format('t');
    }

    public function label(): string
    {
        return self::MONTHS[$this->month - 1].' '.$this->year;
    }

    public function shortLabel(): string
    {
        return ucfirst(self::MONTHS[$this->month - 1]);
    }

    public function toString(): string
    {
        return \sprintf('%04d-%02d', $this->year, $this->month);
    }

    public function __toString(): string
    {
        return $this->toString();
    }
}

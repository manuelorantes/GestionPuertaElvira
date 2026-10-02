<?php

declare(strict_types=1);

namespace App\Domain\Common;

use DateTimeImmutable;
use DateTimeZone;
use Stringable;

/**
 * Fecha de calendario sin hora (zona del club: Europe/Madrid).
 */
final readonly class LocalDate implements Stringable
{
    private const string TIMEZONE = 'Europe/Madrid';

    private function __construct(private DateTimeImmutable $date)
    {
    }

    public static function fromString(string $iso): self
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $iso, new DateTimeZone(self::TIMEZONE));
        if (false === $date || $date->format('Y-m-d') !== $iso) {
            throw new InvalidValue('date', 'La fecha no es válida.');
        }

        return new self($date);
    }

    public static function fromInstant(DateTimeImmutable $instant): self
    {
        return self::fromString($instant->setTimezone(new DateTimeZone(self::TIMEZONE))->format('Y-m-d'));
    }

    public function toString(): string
    {
        return $this->date->format('Y-m-d');
    }

    public function isBefore(self $other): bool
    {
        return $this->date < $other->date;
    }

    public function isAfterOrEqual(self $other): bool
    {
        return !$this->isBefore($other);
    }

    public function equals(self $other): bool
    {
        return $this->toString() === $other->toString();
    }

    public function ageOn(self $day): int
    {
        return $this->date->diff($day->date)->y;
    }

    public function __toString(): string
    {
        return $this->toString();
    }
}

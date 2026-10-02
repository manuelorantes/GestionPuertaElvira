<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine;

use App\Domain\Common\LocalDate;
use DateTimeImmutable;

final readonly class LocalDateMapping
{
    public static function toColumn(LocalDate $date): DateTimeImmutable
    {
        return new DateTimeImmutable($date->toString());
    }

    public static function fromColumn(DateTimeImmutable $date): LocalDate
    {
        return LocalDate::fromString($date->format('Y-m-d'));
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Clock;

use App\Domain\Common\Clock;
use DateTimeImmutable;
use Psr\Clock\ClockInterface;

final readonly class SystemClock implements Clock
{
    public function __construct(private ClockInterface $clock)
    {
    }

    public function now(): DateTimeImmutable
    {
        return $this->clock->now();
    }
}

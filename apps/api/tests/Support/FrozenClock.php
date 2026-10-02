<?php

declare(strict_types=1);

namespace App\Tests\Support;

use App\Domain\Common\Clock;
use DateTimeImmutable;
use DateTimeZone;

final class FrozenClock implements Clock
{
    private DateTimeImmutable $now;

    public function __construct(string $now = '2026-10-02 10:00:00')
    {
        $this->now = new DateTimeImmutable($now, new DateTimeZone('Europe/Madrid'));
    }

    public function now(): DateTimeImmutable
    {
        return $this->now;
    }

    public function advance(string $interval): void
    {
        $this->now = $this->now->modify($interval);
    }
}

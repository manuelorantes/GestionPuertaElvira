<?php

declare(strict_types=1);

namespace App\Tests\Support\Identity;

use App\Application\Identity\Port\SecurityEventLog;
use App\Domain\Identity\UserId;

final class InMemorySecurityEventLog implements SecurityEventLog
{
    /** @var list<array{event: string, outcome: string, userId: ?string}> */
    public array $events = [];

    public function record(string $event, string $outcome, ?UserId $userId = null): void
    {
        $this->events[] = ['event' => $event, 'outcome' => $outcome, 'userId' => $userId?->value];
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Common;

trait RecordsEvents
{
    /** @var list<object> */
    private array $events = [];

    /** @return list<object> */
    public function releaseEvents(): array
    {
        $events = $this->events;
        $this->events = [];

        return $events;
    }

    private function record(object $event): void
    {
        $this->events[] = $event;
    }
}

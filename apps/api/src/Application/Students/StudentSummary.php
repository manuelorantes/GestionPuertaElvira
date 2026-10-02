<?php

declare(strict_types=1);

namespace App\Application\Students;

final readonly class StudentSummary
{
    /** @param list<array{id: string, name: string, slotLabel: string}> $groups */
    public function __construct(
        public string $id,
        public string $fullName,
        public int $age,
        public string $status,
        public array $groups,
        public bool $hasSiblings,
    ) {
    }
}

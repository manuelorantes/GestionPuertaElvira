<?php

declare(strict_types=1);

namespace App\Application\Accounting;

final readonly class EntryInput
{
    public function __construct(
        public string $date,
        public string $kind,
        public string $concept,
        public string $category,
        public string $method,
        public string $amount,
    ) {
    }
}

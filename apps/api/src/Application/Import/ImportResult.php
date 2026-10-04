<?php

declare(strict_types=1);

namespace App\Application\Import;

final readonly class ImportResult
{
    public function __construct(
        public int $created,
        public int $linked,
        public int $skipped,
        public int $payments,
        public int $members,
        public int $entries,
    ) {
    }
}

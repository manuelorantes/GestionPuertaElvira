<?php

declare(strict_types=1);

namespace App\Application\Teachers;

final readonly class TeacherSummary
{
    public function __construct(
        public string $id,
        public string $fullName,
        public bool $active,
        public int $groupCount,
    ) {
    }
}

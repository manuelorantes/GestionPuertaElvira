<?php

declare(strict_types=1);

namespace App\Application\Students;

final readonly class StudentGroup
{
    public function __construct(
        public string $id,
        public string $name,
        public string $slotLabel,
        public string $teacherName,
        public int $classroom,
    ) {
    }
}

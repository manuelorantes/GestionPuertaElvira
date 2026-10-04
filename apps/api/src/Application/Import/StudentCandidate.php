<?php

declare(strict_types=1);

namespace App\Application\Import;

final readonly class StudentCandidate
{
    public function __construct(public string $id, public string $fullName)
    {
    }
}

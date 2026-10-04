<?php

declare(strict_types=1);

namespace App\Application\Audit;

final readonly class AuditFilter
{
    public function __construct(public ?string $userId = null, public ?int $beforeSeq = null, public int $limit = 50)
    {
    }
}

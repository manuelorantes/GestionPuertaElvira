<?php

declare(strict_types=1);

namespace App\Application\Health;

final readonly class HealthReport
{
    public HealthStatus $status;

    public function __construct(public bool $databaseReachable)
    {
        $this->status = $databaseReachable ? HealthStatus::Healthy : HealthStatus::Unhealthy;
    }
}

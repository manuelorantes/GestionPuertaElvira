<?php

declare(strict_types=1);

namespace App\Application\Health;

enum HealthStatus: string
{
    case Healthy = 'healthy';
    case Unhealthy = 'unhealthy';
}

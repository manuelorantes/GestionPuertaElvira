<?php

declare(strict_types=1);

namespace App\Application\Health;

use App\Application\Health\Port\DatabaseHealth;

final readonly class CheckHealth
{
    public function __construct(private DatabaseHealth $database)
    {
    }

    public function __invoke(): HealthReport
    {
        return new HealthReport($this->database->isReachable());
    }
}

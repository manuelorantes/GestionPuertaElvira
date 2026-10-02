<?php

declare(strict_types=1);

namespace App\Tests\Application\Health;

use App\Application\Health\CheckHealth;
use App\Application\Health\HealthStatus;
use App\Application\Health\Port\DatabaseHealth;
use PHPUnit\Framework\TestCase;

final class CheckHealthTest extends TestCase
{
    public function test_should_report_healthy_when_database_is_reachable(): void
    {
        $checkHealth = new CheckHealth($this->databaseThatIs(reachable: true));

        $report = $checkHealth();

        self::assertSame(HealthStatus::Healthy, $report->status);
        self::assertTrue($report->databaseReachable);
    }

    public function test_should_report_unhealthy_when_database_is_unreachable(): void
    {
        $checkHealth = new CheckHealth($this->databaseThatIs(reachable: false));

        $report = $checkHealth();

        self::assertSame(HealthStatus::Unhealthy, $report->status);
        self::assertFalse($report->databaseReachable);
    }

    private function databaseThatIs(bool $reachable): DatabaseHealth
    {
        return new readonly class($reachable) implements DatabaseHealth {
            public function __construct(private bool $reachable)
            {
            }

            public function isReachable(): bool
            {
                return $this->reachable;
            }
        };
    }
}

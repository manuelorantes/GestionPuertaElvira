<?php

declare(strict_types=1);

namespace App\Tests\Infrastructure\Http;

use App\Application\Health\CheckHealth;
use App\Application\Health\Port\DatabaseHealth;
use App\Infrastructure\Http\Health\HealthController;
use PHPUnit\Framework\TestCase;

final class HealthControllerTest extends TestCase
{
    public function test_should_answer_service_unavailable_when_the_database_is_unreachable(): void
    {
        $controller = new HealthController(new CheckHealth(new class implements DatabaseHealth {
            public function isReachable(): bool
            {
                return false;
            }
        }));

        $response = $controller();

        self::assertSame(503, $response->getStatusCode());
        self::assertJsonStringEqualsJsonString(
            '{"status":"unhealthy","database":"unreachable"}',
            (string) $response->getContent(),
        );
    }
}

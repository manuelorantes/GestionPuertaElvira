<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class HealthEndpointTest extends WebTestCase
{
    public function test_should_report_healthy_status_when_the_database_is_reachable(): void
    {
        $client = self::createClient();

        $client->request('GET', '/api/health');

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'application/json');
        self::assertJsonStringEqualsJsonString(
            '{"status":"healthy","database":"reachable"}',
            (string) $client->getResponse()->getContent(),
        );
    }

    public function test_should_return_a_request_id_header_when_answering(): void
    {
        $client = self::createClient();

        $client->request('GET', '/api/health');

        self::assertMatchesRegularExpression(
            '/^[0-9a-f-]{36}$/',
            (string) $client->getResponse()->headers->get('X-Request-Id'),
        );
    }
}

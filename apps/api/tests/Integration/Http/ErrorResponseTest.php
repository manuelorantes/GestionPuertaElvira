<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class ErrorResponseTest extends WebTestCase
{
    public function test_should_answer_with_a_json_error_envelope_when_the_route_does_not_exist(): void
    {
        $client = self::createClient();

        $client->request('GET', '/api/does-not-exist');

        self::assertResponseStatusCodeSame(404);
        self::assertResponseHeaderSame('Content-Type', 'application/json');
        self::assertJsonStringEqualsJsonString(
            '{"error":{"code":"not_found","message":"Recurso no encontrado."}}',
            (string) $client->getResponse()->getContent(),
        );
    }

    public function test_should_answer_method_not_allowed_when_using_an_unsupported_verb(): void
    {
        $client = self::createClient();

        $client->request('DELETE', '/api/health');

        self::assertResponseStatusCodeSame(405);
        self::assertJsonStringEqualsJsonString(
            '{"error":{"code":"method_not_allowed","message":"Método no permitido."}}',
            (string) $client->getResponse()->getContent(),
        );
    }
}

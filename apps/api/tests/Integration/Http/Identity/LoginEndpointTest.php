<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http\Identity;

use App\Tests\Support\Identity\ApiAuthTestCase;

final class LoginEndpointTest extends ApiAuthTestCase
{
    public function test_should_start_a_session_cookie_and_return_the_user_when_credentials_are_valid(): void
    {
        $user = $this->createUser('junta@club.es');

        $this->logIn('Junta@Club.es');

        self::assertResponseIsSuccessful();
        self::assertSame(['user' => [
            'id' => $user->id()->value,
            'fullName' => 'Lucía Moreno Gil',
            'email' => 'junta@club.es',
            'role' => 'administrator',
            'mustChangePassword' => false,
        ]], $this->responseBody());
        $cookie = $this->client->getResponse()->headers->getCookies()[0] ?? null;
        self::assertNotNull($cookie);
        self::assertSame('pe_session', $cookie->getName());
        self::assertTrue($cookie->isHttpOnly());
        self::assertSame('strict', $cookie->getSameSite());
        self::assertSame('/', $cookie->getPath());
        self::assertSame(0, $cookie->getExpiresTime(), 'Cookie de sesión del navegador, sin fecha de caducidad');
    }

    public function test_should_answer_a_generic_error_when_the_password_is_wrong_or_the_email_unknown(): void
    {
        $this->createUser('junta@club.es');

        $this->logIn('junta@club.es', 'contraseña-incorrecta');
        $this->assertError(401, 'invalid_credentials');
        self::assertSame('Email o contraseña incorrectos.', $this->errorMessage());

        $this->logIn('nadie@club.es');
        $this->assertError(401, 'invalid_credentials');
    }

    public function test_should_block_further_attempts_after_five_failures(): void
    {
        $this->createUser('bloqueo@club.es');
        for ($i = 0; $i < 5; ++$i) {
            $this->logIn('bloqueo@club.es', 'contraseña-incorrecta');
        }

        $this->logIn('bloqueo@club.es');

        $this->assertError(429, 'too_many_requests');
        self::assertGreaterThan(0, (int) $this->client->getResponse()->headers->get('Retry-After'));
    }

    public function test_should_reject_a_body_without_the_required_fields(): void
    {
        $this->json('POST', '/api/auth/login', ['email' => 'junta@club.es']);

        $this->assertError(422, 'unprocessable');
    }

    public function test_should_refuse_state_changing_requests_that_are_not_json(): void
    {
        $this->client->request('POST', '/api/auth/login', ['email' => 'junta@club.es', 'password' => self::PASSWORD]);

        $this->assertError(415, 'unsupported_media_type');
    }
}

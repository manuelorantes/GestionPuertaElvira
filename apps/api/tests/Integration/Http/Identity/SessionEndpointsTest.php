<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http\Identity;

use App\Domain\Identity\Role;
use App\Infrastructure\Persistence\Doctrine\Repository\Identity\DoctrineUserRepository;
use App\Tests\Support\Identity\ApiAuthTestCase;

final class SessionEndpointsTest extends ApiAuthTestCase
{
    public function test_should_reject_the_current_user_request_when_there_is_no_session(): void
    {
        $this->client->request('GET', '/api/auth/me');

        $this->assertError(401, 'unauthorized');
    }

    public function test_should_return_the_current_user_and_forbid_caching_when_logged_in(): void
    {
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');

        $this->client->request('GET', '/api/auth/me');

        self::assertResponseIsSuccessful();
        self::assertSame('junta@club.es', $this->userInResponse()['email'] ?? null);
        self::assertStringContainsString('no-store', (string) $this->client->getResponse()->headers->get('Cache-Control'));
    }

    public function test_should_end_the_session_and_clear_the_cookie_when_logging_out(): void
    {
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');

        $this->json('POST', '/api/auth/logout');

        self::assertResponseStatusCodeSame(204);
        $cleared = $this->client->getResponse()->headers->getCookies()[0] ?? null;
        self::assertTrue(null !== $cleared && $cleared->isCleared());
        $this->client->request('GET', '/api/auth/me');
        $this->assertError(401, 'unauthorized');
    }

    public function test_should_stop_working_on_the_next_request_when_the_account_is_disabled(): void
    {
        $user = $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');

        $user->disable();
        self::getContainer()->get(DoctrineUserRepository::class)->save($user);
        $this->client->request('GET', '/api/auth/me');

        $this->assertError(401, 'unauthorized');
    }

    public function test_should_change_the_password_when_the_current_one_is_right(): void
    {
        $this->createUser('junta@club.es', mustChangePassword: true);
        $this->logIn('junta@club.es');

        $this->json('PUT', '/api/auth/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'apertura-espanola']);

        self::assertResponseStatusCodeSame(204);
        $this->client->request('GET', '/api/auth/me');
        self::assertFalse($this->userInResponse()['mustChangePassword'] ?? true);
    }

    public function test_should_explain_why_the_password_change_was_refused(): void
    {
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');

        $this->json('PUT', '/api/auth/password', ['currentPassword' => 'otra-distinta-123', 'newPassword' => 'apertura-espanola']);
        $this->assertError(422, 'current_password_mismatch');

        $this->json('PUT', '/api/auth/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'corta']);
        $this->assertError(422, 'weak_password');
        self::assertSame('La contraseña debe tener al menos 12 caracteres.', $this->errorMessage());
    }

    public function test_should_block_the_panel_until_the_temporary_password_is_changed(): void
    {
        $this->createUser('nueva@club.es', mustChangePassword: true);
        $this->logIn('nueva@club.es');

        $this->client->request('GET', '/api/admin/ping');
        $this->assertError(403, 'password_change_required');

        $this->client->request('GET', '/api/auth/me');
        self::assertResponseIsSuccessful();
    }

    public function test_should_allow_administration_only_to_administrators(): void
    {
        $this->createUser('profe@club.es', Role::Teacher);
        $this->createUser('junta@club.es');

        $this->logIn('profe@club.es');
        $this->client->request('GET', '/api/admin/ping');
        $this->assertError(403, 'forbidden');

        $this->logIn('junta@club.es');
        $this->client->request('GET', '/api/admin/ping');
        self::assertResponseIsSuccessful();
    }

    public function test_should_keep_the_health_check_public(): void
    {
        $this->client->request('GET', '/api/health');

        self::assertResponseIsSuccessful();
    }
}

<?php

declare(strict_types=1);

namespace App\Tests\Support\Identity;

use App\Domain\Common\EmailAddress;
use App\Domain\Common\FullName;
use App\Domain\Identity\PlainPassword;
use App\Domain\Identity\Role;
use App\Domain\Identity\User;
use App\Domain\Identity\UserId;
use App\Infrastructure\Identity\Security\SymfonyPasswordHasher;
use App\Infrastructure\Persistence\Doctrine\Repository\Identity\DoctrineUserRepository;
use DateTimeImmutable;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

abstract class ApiAuthTestCase extends WebTestCase
{
    protected const string PASSWORD = 'torre-de-marfil';

    protected KernelBrowser $client;

    protected function setUp(): void
    {
        $this->client = self::createClient();
    }

    protected function createUser(string $email, Role $role = Role::Administrator, bool $mustChangePassword = false): User
    {
        $hasher = self::getContainer()->get(SymfonyPasswordHasher::class);
        $hash = $hasher->hash(PlainPassword::fromString(self::PASSWORD));
        $now = new DateTimeImmutable();
        $user = User::register(UserId::generate(), EmailAddress::fromString($email), FullName::fromString('Lucía Moreno Gil'), $role, $hash, $now);
        if (!$mustChangePassword) {
            $user->changePassword($hash, $now);
        }
        self::getContainer()->get(DoctrineUserRepository::class)->save($user);

        return $user;
    }

    /** @param array<string, mixed> $body */
    protected function json(string $method, string $uri, array $body = []): void
    {
        $this->client->request($method, $uri, server: ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], content: json_encode($body, \JSON_THROW_ON_ERROR));
    }

    protected function logIn(string $email, string $password = self::PASSWORD): void
    {
        $this->json('POST', '/api/auth/login', ['email' => $email, 'password' => $password]);
    }

    /** @return array<mixed> */
    protected function responseBody(): array
    {
        $decoded = json_decode((string) $this->client->getResponse()->getContent(), true, flags: \JSON_THROW_ON_ERROR);
        self::assertIsArray($decoded);

        return $decoded;
    }

    protected function errorMessage(): string
    {
        $error = $this->responseBody()['error'] ?? null;
        self::assertIsArray($error);
        self::assertIsString($error['message'] ?? null);

        return $error['message'];
    }

    /** @return array<mixed> */
    protected function errorDetails(): array
    {
        $error = $this->responseBody()['error'] ?? null;
        self::assertIsArray($error);
        self::assertIsArray($error['details'] ?? null);

        return $error['details'];
    }

    /** @return array<mixed> */
    protected function userInResponse(): array
    {
        $user = $this->responseBody()['user'] ?? null;
        self::assertIsArray($user);

        return $user;
    }

    protected function assertError(int $status, string $code): void
    {
        self::assertResponseStatusCodeSame($status);
        $body = $this->responseBody();
        self::assertIsArray($body['error'] ?? null);
        self::assertSame($code, $body['error']['code'] ?? null);
    }
}

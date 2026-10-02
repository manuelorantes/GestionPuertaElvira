<?php

declare(strict_types=1);

namespace App\Tests\Support\Identity;

use App\Domain\Identity\EmailAddress;
use App\Domain\Identity\FullName;
use App\Domain\Identity\PasswordHash;
use App\Domain\Identity\Role;
use App\Domain\Identity\User;
use App\Domain\Identity\UserId;
use App\Tests\Support\FrozenClock;

/**
 * Conjunto de dobles de Identity listo para montar casos de uso en tests.
 */
final class IdentityFixture
{
    public const string EMAIL = 'junta@club.es';
    public const string PASSWORD = 'torre-de-marfil';

    public readonly InMemoryUserRepository $users;
    public readonly InMemorySessionRepository $sessions;
    public readonly FakePasswordHasher $hasher;
    public readonly SequentialSessionTokenGenerator $tokens;
    public readonly InMemoryLoginAttemptLimiter $limiter;
    public readonly InMemorySecurityEventLog $log;
    public readonly FixedTemporaryPasswordGenerator $temporaryPasswords;
    public readonly FrozenClock $clock;

    public function __construct()
    {
        $this->users = new InMemoryUserRepository();
        $this->sessions = new InMemorySessionRepository();
        $this->hasher = new FakePasswordHasher();
        $this->tokens = new SequentialSessionTokenGenerator();
        $this->limiter = new InMemoryLoginAttemptLimiter();
        $this->log = new InMemorySecurityEventLog();
        $this->temporaryPasswords = new FixedTemporaryPasswordGenerator();
        $this->clock = new FrozenClock();
    }

    public function existingUser(
        string $email = self::EMAIL,
        string $passwordHash = 'hashed:'.self::PASSWORD,
        Role $role = Role::Administrator,
        bool $mustChangePassword = false,
    ): User {
        $user = User::register(
            UserId::generate(),
            EmailAddress::fromString($email),
            FullName::fromString('Lucía Moreno Gil'),
            $role,
            new PasswordHash($passwordHash),
            $this->clock->now(),
        );
        if (!$mustChangePassword) {
            $user->changePassword(new PasswordHash($passwordHash), $this->clock->now());
        }
        $this->users->save($user);

        return $user;
    }
}

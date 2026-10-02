<?php

declare(strict_types=1);

namespace App\Application\Identity;

use App\Application\Identity\Error\InvalidCredentials;
use App\Application\Identity\Error\TooManyLoginAttempts;
use App\Application\Identity\Port\LoginAttemptLimiter;
use App\Application\Identity\Port\PasswordHasher;
use App\Application\Identity\Port\SecurityEventLog;
use App\Application\Identity\Port\SessionRepository;
use App\Application\Identity\Port\SessionTokenGenerator;
use App\Application\Identity\Port\UserRepository;
use App\Domain\Common\Clock;
use App\Domain\Common\InvalidValue;
use App\Domain\Identity\EmailAddress;
use App\Domain\Identity\PasswordHash;
use App\Domain\Identity\PlainPassword;
use App\Domain\Identity\Session;
use App\Domain\Identity\SessionId;
use App\Domain\Identity\User;
use SensitiveParameter;

final class LogIn
{
    private ?PasswordHash $decoyHash = null;

    public function __construct(
        private readonly UserRepository $users,
        private readonly SessionRepository $sessions,
        private readonly PasswordHasher $hasher,
        private readonly SessionTokenGenerator $tokens,
        private readonly LoginAttemptLimiter $limiter,
        private readonly SecurityEventLog $log,
        private readonly Clock $clock,
    ) {
    }

    /**
     * @throws InvalidCredentials
     * @throws TooManyLoginAttempts
     */
    public function __invoke(string $email, #[SensitiveParameter] string $password, string $clientIp): LoginResult
    {
        try {
            $address = EmailAddress::fromString($email);
            $plain = PlainPassword::fromString($password);
        } catch (InvalidValue) {
            $this->log->record('login', 'failure');

            throw new InvalidCredentials();
        }

        $this->limiter->assertCanAttempt($address, $clientIp);

        $user = $this->users->findByEmail($address);
        if (!$this->passwordMatches($user, $plain) || null === $user || !$user->canAuthenticate()) {
            $this->limiter->recordFailure($address, $clientIp);
            $this->log->record('login', 'failure', $user?->id());

            throw new InvalidCredentials();
        }

        $this->limiter->reset($address);
        $this->upgradeHashIfNeeded($user, $plain);

        $token = $this->tokens->generate();
        $session = Session::start(SessionId::generate(), $this->tokens->hash($token), $user->id(), $this->clock->now());
        $this->sessions->save($session);
        $this->log->record('login', 'success', $user->id());

        return new LoginResult($token, AuthenticatedUser::from($user, $session));
    }

    /**
     * Verifica siempre un hash, aunque el usuario no exista, para no revelar cuentas por el tiempo de respuesta.
     */
    private function passwordMatches(?User $user, PlainPassword $password): bool
    {
        return $this->hasher->verify($user?->passwordHash() ?? $this->decoyHash(), $password) && null !== $user;
    }

    private function decoyHash(): PasswordHash
    {
        return $this->decoyHash ??= $this->hasher->hash(PlainPassword::fromString(bin2hex(random_bytes(16))));
    }

    private function upgradeHashIfNeeded(User $user, PlainPassword $password): void
    {
        if ($this->hasher->needsRehash($user->passwordHash())) {
            $user->upgradePasswordHash($this->hasher->hash($password));
            $this->users->save($user);
        }
    }
}

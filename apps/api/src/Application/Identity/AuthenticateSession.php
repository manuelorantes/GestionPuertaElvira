<?php

declare(strict_types=1);

namespace App\Application\Identity;

use App\Application\Identity\Error\SessionNotValid;
use App\Application\Identity\Port\SessionRepository;
use App\Application\Identity\Port\SessionTokenGenerator;
use App\Application\Identity\Port\UserRepository;
use App\Domain\Common\Clock;
use App\Domain\Identity\SessionPolicy;
use SensitiveParameter;

final readonly class AuthenticateSession
{
    public function __construct(
        private SessionRepository $sessions,
        private UserRepository $users,
        private SessionTokenGenerator $tokens,
        private Clock $clock,
    ) {
    }

    /** @throws SessionNotValid */
    public function __invoke(#[SensitiveParameter] string $token): AuthenticatedUser
    {
        $session = $this->sessions->findByTokenHash($this->tokens->hash(new SessionToken($token)))
            ?? throw new SessionNotValid();
        $now = $this->clock->now();

        if ($session->isExpiredAt($now, SessionPolicy::standard())) {
            $this->sessions->remove($session->id());

            throw new SessionNotValid();
        }

        $user = $this->users->find($session->userId());
        if (null === $user || !$user->canAuthenticate()) {
            throw new SessionNotValid();
        }

        if ($session->touch($now)) {
            $this->sessions->save($session);
        }

        return AuthenticatedUser::from($user, $session);
    }
}

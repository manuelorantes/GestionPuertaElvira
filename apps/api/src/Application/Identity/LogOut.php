<?php

declare(strict_types=1);

namespace App\Application\Identity;

use App\Application\Identity\Port\SecurityEventLog;
use App\Application\Identity\Port\SessionRepository;
use App\Application\Identity\Port\SessionTokenGenerator;
use SensitiveParameter;

final readonly class LogOut
{
    public function __construct(
        private SessionRepository $sessions,
        private SessionTokenGenerator $tokens,
        private SecurityEventLog $log,
    ) {
    }

    public function __invoke(#[SensitiveParameter] string $token): void
    {
        $session = $this->sessions->findByTokenHash($this->tokens->hash(new SessionToken($token)));
        if (null === $session) {
            return;
        }

        $this->sessions->remove($session->id());
        $this->log->record('logout', 'success', $session->userId());
    }
}

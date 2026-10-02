<?php

declare(strict_types=1);

namespace App\Tests\Support\Identity;

use App\Application\Identity\Port\SessionRepository;
use App\Domain\Identity\Session;
use App\Domain\Identity\SessionId;
use App\Domain\Identity\SessionTokenHash;
use App\Domain\Identity\UserId;

final class InMemorySessionRepository implements SessionRepository
{
    /** @var array<string, Session> */
    private array $sessions = [];

    public function findByTokenHash(SessionTokenHash $tokenHash): ?Session
    {
        foreach ($this->sessions as $session) {
            if ($session->tokenHash()->value === $tokenHash->value) {
                return $session;
            }
        }

        return null;
    }

    public function save(Session $session): void
    {
        $this->sessions[$session->id()->value] = $session;
    }

    public function remove(SessionId $id): void
    {
        unset($this->sessions[$id->value]);
    }

    public function removeAllForUser(UserId $userId, ?SessionId $except = null): void
    {
        $this->sessions = array_filter(
            $this->sessions,
            static fn (Session $session): bool => !$session->userId()->equals($userId) || (null !== $except && $session->id()->equals($except)),
        );
    }

    /** @return list<Session> */
    public function forUser(UserId $userId): array
    {
        return array_values(array_filter($this->sessions, static fn (Session $s): bool => $s->userId()->equals($userId)));
    }
}

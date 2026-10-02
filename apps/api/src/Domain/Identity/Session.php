<?php

declare(strict_types=1);

namespace App\Domain\Identity;

use DateTimeImmutable;

/**
 * Sesión iniciada por un usuario en un navegador.
 */
final class Session
{
    private function __construct(
        private readonly SessionId $id,
        private readonly SessionTokenHash $tokenHash,
        private readonly UserId $userId,
        private readonly DateTimeImmutable $startedAt,
        private DateTimeImmutable $lastActivityAt,
    ) {
    }

    public static function start(SessionId $id, SessionTokenHash $tokenHash, UserId $userId, DateTimeImmutable $now): self
    {
        return new self($id, $tokenHash, $userId, $now, $now);
    }

    public static function restore(
        SessionId $id,
        SessionTokenHash $tokenHash,
        UserId $userId,
        DateTimeImmutable $startedAt,
        DateTimeImmutable $lastActivityAt,
    ): self {
        return new self($id, $tokenHash, $userId, $startedAt, $lastActivityAt);
    }

    public function isExpiredAt(DateTimeImmutable $now, SessionPolicy $policy): bool
    {
        $idle = $now->getTimestamp() - $this->lastActivityAt->getTimestamp();
        $age = $now->getTimestamp() - $this->startedAt->getTimestamp();

        return $idle >= $policy->idleSeconds || $age >= $policy->absoluteSeconds;
    }

    /**
     * Registra actividad si ha pasado más de un minuto desde la última. Devuelve si hubo cambio.
     */
    public function touch(DateTimeImmutable $now, ?SessionPolicy $policy = null): bool
    {
        $resolution = ($policy ?? SessionPolicy::standard())->activityResolutionSeconds;

        if ($now->getTimestamp() - $this->lastActivityAt->getTimestamp() <= $resolution) {
            return false;
        }

        $this->lastActivityAt = $now;

        return true;
    }

    public function id(): SessionId
    {
        return $this->id;
    }

    public function tokenHash(): SessionTokenHash
    {
        return $this->tokenHash;
    }

    public function userId(): UserId
    {
        return $this->userId;
    }

    public function startedAt(): DateTimeImmutable
    {
        return $this->startedAt;
    }

    public function lastActivityAt(): DateTimeImmutable
    {
        return $this->lastActivityAt;
    }
}

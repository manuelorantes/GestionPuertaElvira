<?php

declare(strict_types=1);

namespace App\Application\Identity\Port;

use App\Domain\Identity\Session;
use App\Domain\Identity\SessionId;
use App\Domain\Identity\SessionTokenHash;
use App\Domain\Identity\UserId;

interface SessionRepository
{
    public function findByTokenHash(SessionTokenHash $tokenHash): ?Session;

    public function save(Session $session): void;

    public function remove(SessionId $id): void;

    public function removeAllForUser(UserId $userId, ?SessionId $except = null): void;
}

<?php

declare(strict_types=1);

namespace App\Application\Identity;

use App\Application\Identity\Port\SecurityEventLog;
use App\Application\Identity\Port\SessionRepository;
use App\Application\Identity\Port\UserRepository;

final readonly class DisableUser
{
    public function __construct(
        private UserRepository $users,
        private SessionRepository $sessions,
        private SecurityEventLog $log,
    ) {
    }

    public function __invoke(string $email): void
    {
        $user = UserLookup::byEmail($this->users, $email);
        $user->disable();
        $this->users->save($user);
        $this->sessions->removeAllForUser($user->id());
        $this->log->record('user_disabled', 'success', $user->id());
    }
}

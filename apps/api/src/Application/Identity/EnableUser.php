<?php

declare(strict_types=1);

namespace App\Application\Identity;

use App\Application\Identity\Port\SecurityEventLog;
use App\Application\Identity\Port\UserRepository;

final readonly class EnableUser
{
    public function __construct(private UserRepository $users, private SecurityEventLog $log)
    {
    }

    public function __invoke(string $email): void
    {
        $user = UserLookup::byEmail($this->users, $email);
        $user->enable();
        $this->users->save($user);
        $this->log->record('user_enabled', 'success', $user->id());
    }
}

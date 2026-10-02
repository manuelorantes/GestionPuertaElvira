<?php

declare(strict_types=1);

namespace App\Application\Identity;

use App\Application\Identity\Port\SecurityEventLog;
use App\Application\Identity\Port\UserRepository;
use App\Domain\Identity\Role;

final readonly class ChangeUserRole
{
    public function __construct(private UserRepository $users, private SecurityEventLog $log)
    {
    }

    public function __invoke(string $email, string $role): void
    {
        $user = UserLookup::byEmail($this->users, $email);
        $user->changeRole(Role::fromName($role));
        $this->users->save($user);
        $this->log->record('role_changed', 'success', $user->id());
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Identity;

use App\Domain\Identity\Role;
use App\Domain\Identity\Session;
use App\Domain\Identity\User;

final readonly class AuthenticatedUser
{
    public function __construct(
        public string $id,
        public string $sessionId,
        public string $fullName,
        public string $email,
        public Role $role,
        public bool $mustChangePassword,
    ) {
    }

    public static function from(User $user, Session $session): self
    {
        return new self(
            $user->id()->value,
            $session->id()->value,
            $user->fullName()->value,
            $user->email()->value,
            $user->role(),
            $user->mustChangePassword(),
        );
    }
}

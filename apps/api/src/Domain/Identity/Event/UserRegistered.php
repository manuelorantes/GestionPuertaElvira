<?php

declare(strict_types=1);

namespace App\Domain\Identity\Event;

use App\Domain\Identity\Role;
use App\Domain\Identity\UserId;

final readonly class UserRegistered
{
    public function __construct(public UserId $userId, public Role $role)
    {
    }
}

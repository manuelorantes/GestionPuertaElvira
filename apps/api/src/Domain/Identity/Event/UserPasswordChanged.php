<?php

declare(strict_types=1);

namespace App\Domain\Identity\Event;

use App\Domain\Identity\UserId;

final readonly class UserPasswordChanged
{
    public function __construct(public UserId $userId)
    {
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Identity;

use App\Application\Identity\Error\UserNotFound;
use App\Application\Identity\Port\UserRepository;
use App\Domain\Identity\EmailAddress;
use App\Domain\Identity\User;

final readonly class UserLookup
{
    /** @throws UserNotFound */
    public static function byEmail(UserRepository $users, string $email): User
    {
        return $users->findByEmail(EmailAddress::fromString($email)) ?? throw new UserNotFound();
    }
}

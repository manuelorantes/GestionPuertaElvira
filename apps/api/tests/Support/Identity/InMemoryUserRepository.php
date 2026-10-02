<?php

declare(strict_types=1);

namespace App\Tests\Support\Identity;

use App\Application\Identity\Port\UserRepository;
use App\Domain\Identity\EmailAddress;
use App\Domain\Identity\User;
use App\Domain\Identity\UserId;

final class InMemoryUserRepository implements UserRepository
{
    /** @var array<string, User> */
    private array $users = [];

    public function find(UserId $id): ?User
    {
        return $this->users[$id->value] ?? null;
    }

    public function findByEmail(EmailAddress $email): ?User
    {
        foreach ($this->users as $user) {
            if ($user->email()->equals($email)) {
                return $user;
            }
        }

        return null;
    }

    public function save(User $user): void
    {
        $user->releaseEvents();
        $this->users[$user->id()->value] = $user;
    }
}

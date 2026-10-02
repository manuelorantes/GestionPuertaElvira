<?php

declare(strict_types=1);

namespace App\Application\Identity\Port;

use App\Domain\Common\EmailAddress;
use App\Domain\Identity\User;
use App\Domain\Identity\UserId;

interface UserRepository
{
    public function find(UserId $id): ?User;

    public function findByEmail(EmailAddress $email): ?User;

    public function save(User $user): void;
}

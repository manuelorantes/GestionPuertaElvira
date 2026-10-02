<?php

declare(strict_types=1);

namespace App\Application\Identity\Port;

use App\Domain\Identity\PasswordHash;
use App\Domain\Identity\PlainPassword;

interface PasswordHasher
{
    public function hash(PlainPassword $password): PasswordHash;

    public function verify(PasswordHash $hash, PlainPassword $password): bool;

    public function needsRehash(PasswordHash $hash): bool;
}

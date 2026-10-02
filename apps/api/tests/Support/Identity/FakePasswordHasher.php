<?php

declare(strict_types=1);

namespace App\Tests\Support\Identity;

use App\Application\Identity\Port\PasswordHasher;
use App\Domain\Identity\PasswordHash;
use App\Domain\Identity\PlainPassword;

/** Hash reversible y legible para tests: "hashed:<secreto>". */
final class FakePasswordHasher implements PasswordHasher
{
    public int $verifications = 0;

    /** @var list<string> */
    public array $outdatedHashes = [];

    public function hash(PlainPassword $password): PasswordHash
    {
        return new PasswordHash('hashed:'.$password->reveal());
    }

    public function verify(PasswordHash $hash, PlainPassword $password): bool
    {
        ++$this->verifications;

        return $hash->value === 'hashed:'.$password->reveal() || $hash->value === 'old:'.$password->reveal();
    }

    public function needsRehash(PasswordHash $hash): bool
    {
        return str_starts_with($hash->value, 'old:');
    }
}

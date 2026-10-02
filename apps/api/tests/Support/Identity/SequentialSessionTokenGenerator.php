<?php

declare(strict_types=1);

namespace App\Tests\Support\Identity;

use App\Application\Identity\Port\SessionTokenGenerator;
use App\Application\Identity\SessionToken;
use App\Domain\Identity\SessionTokenHash;

final class SequentialSessionTokenGenerator implements SessionTokenGenerator
{
    private int $sequence = 0;

    public function generate(): SessionToken
    {
        return new SessionToken('token-'.++$this->sequence);
    }

    public function hash(SessionToken $token): SessionTokenHash
    {
        return new SessionTokenHash(hash('sha256', $token->value));
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Security;

use App\Application\Identity\Port\SessionTokenGenerator;
use App\Application\Identity\SessionToken;
use App\Domain\Identity\SessionTokenHash;

/**
 * 256 bits aleatorios en base64url; en base de datos solo se guarda su SHA-256.
 */
final readonly class RandomSessionTokenGenerator implements SessionTokenGenerator
{
    public function generate(): SessionToken
    {
        return new SessionToken(rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '='));
    }

    public function hash(SessionToken $token): SessionTokenHash
    {
        return new SessionTokenHash(hash('sha256', $token->value));
    }
}

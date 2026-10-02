<?php

declare(strict_types=1);

namespace App\Application\Identity\Port;

use App\Application\Identity\SessionToken;
use App\Domain\Identity\SessionTokenHash;

interface SessionTokenGenerator
{
    public function generate(): SessionToken;

    public function hash(SessionToken $token): SessionTokenHash;
}

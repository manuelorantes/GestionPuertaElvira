<?php

declare(strict_types=1);

namespace App\Application\Identity\Port;

use App\Application\Identity\Error\TooManyLoginAttempts;
use App\Domain\Common\EmailAddress;

interface LoginAttemptLimiter
{
    /** @throws TooManyLoginAttempts */
    public function assertCanAttempt(EmailAddress $email, string $clientIp): void;

    public function recordFailure(EmailAddress $email, string $clientIp): void;

    public function reset(EmailAddress $email): void;
}

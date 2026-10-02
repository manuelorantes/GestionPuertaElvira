<?php

declare(strict_types=1);

namespace App\Tests\Support\Identity;

use App\Application\Identity\Error\TooManyLoginAttempts;
use App\Application\Identity\Port\LoginAttemptLimiter;
use App\Domain\Identity\EmailAddress;

final class InMemoryLoginAttemptLimiter implements LoginAttemptLimiter
{
    /** @var array<string, int> */
    public array $failures = [];

    public function __construct(private readonly int $maxFailures = 5)
    {
    }

    public function assertCanAttempt(EmailAddress $email, string $clientIp): void
    {
        if (($this->failures[$email->value] ?? 0) >= $this->maxFailures) {
            throw new TooManyLoginAttempts(900);
        }
    }

    public function recordFailure(EmailAddress $email, string $clientIp): void
    {
        $this->failures[$email->value] = ($this->failures[$email->value] ?? 0) + 1;
    }

    public function reset(EmailAddress $email): void
    {
        unset($this->failures[$email->value]);
    }
}

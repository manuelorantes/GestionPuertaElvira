<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Security;

use App\Application\Identity\Error\TooManyLoginAttempts;
use App\Application\Identity\Port\LoginAttemptLimiter;
use App\Domain\Common\EmailAddress;
use Symfony\Component\RateLimiter\LimiterInterface;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;

/**
 * Límites configurados en rate_limiter.yaml (login_email y login_ip). Las claves no guardan
 * el email en claro.
 */
final readonly class RateLimiterLoginAttemptLimiter implements LoginAttemptLimiter
{
    public function __construct(
        private RateLimiterFactoryInterface $loginEmailLimiter,
        private RateLimiterFactoryInterface $loginIpLimiter,
    ) {
    }

    public function assertCanAttempt(EmailAddress $email, string $clientIp): void
    {
        foreach ([$this->forEmail($email), $this->forIp($clientIp)] as $limiter) {
            $limit = $limiter->consume(0);
            if (0 === $limit->getRemainingTokens()) {
                throw new TooManyLoginAttempts(max(1, $limit->getRetryAfter()->getTimestamp() - time()));
            }
        }
    }

    public function recordFailure(EmailAddress $email, string $clientIp): void
    {
        $this->forEmail($email)->consume();
        $this->forIp($clientIp)->consume();
    }

    public function reset(EmailAddress $email): void
    {
        $this->forEmail($email)->reset();
    }

    private function forEmail(EmailAddress $email): LimiterInterface
    {
        return $this->loginEmailLimiter->create(hash('sha256', $email->value));
    }

    private function forIp(string $clientIp): LimiterInterface
    {
        return $this->loginIpLimiter->create($clientIp);
    }
}

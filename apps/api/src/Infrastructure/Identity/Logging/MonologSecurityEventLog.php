<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Logging;

use App\Application\Identity\Port\SecurityEventLog;
use App\Domain\Identity\UserId;
use Psr\Log\LoggerInterface;
use Psr\Log\LogLevel;
use Symfony\Component\DependencyInjection\Attribute\Target;

final readonly class MonologSecurityEventLog implements SecurityEventLog
{
    public function __construct(#[Target('identity')] private LoggerInterface $logger)
    {
    }

    public function record(string $event, string $outcome, ?UserId $userId = null): void
    {
        $this->logger->log(
            'success' === $outcome ? LogLevel::INFO : LogLevel::NOTICE,
            'security.'.$event,
            ['event' => $event, 'outcome' => $outcome, 'user_id' => $userId?->value],
        );
    }
}

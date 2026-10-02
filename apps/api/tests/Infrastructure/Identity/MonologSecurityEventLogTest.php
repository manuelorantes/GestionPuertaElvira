<?php

declare(strict_types=1);

namespace App\Tests\Infrastructure\Identity;

use App\Domain\Identity\UserId;
use App\Infrastructure\Identity\Logging\MonologSecurityEventLog;
use PHPUnit\Framework\TestCase;
use Psr\Log\AbstractLogger;
use Stringable;

final class MonologSecurityEventLogTest extends TestCase
{
    public function test_should_emit_a_structured_event_with_outcome_and_user_only(): void
    {
        $logger = new class extends AbstractLogger {
            /** @var list<array{level: mixed, message: string, context: array<mixed>}> */
            public array $records = [];

            public function log($level, Stringable|string $message, array $context = []): void
            {
                $this->records[] = ['level' => $level, 'message' => (string) $message, 'context' => $context];
            }
        };
        $userId = UserId::generate();

        new MonologSecurityEventLog($logger)->record('login', 'failure', $userId);

        self::assertSame([[
            'level' => 'notice',
            'message' => 'security.login',
            'context' => ['event' => 'login', 'outcome' => 'failure', 'user_id' => $userId->value],
        ]], $logger->records);
    }

    public function test_should_log_successes_at_info_level(): void
    {
        $logger = new class extends AbstractLogger {
            public mixed $level = null;

            public function log($level, Stringable|string $message, array $context = []): void
            {
                $this->level = $level;
            }
        };

        new MonologSecurityEventLog($logger)->record('logout', 'success');

        self::assertSame('info', $logger->level);
    }
}

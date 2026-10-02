<?php

declare(strict_types=1);

namespace App\Tests\Domain\Identity;

use App\Domain\Identity\Session;
use App\Domain\Identity\SessionId;
use App\Domain\Identity\SessionPolicy;
use App\Domain\Identity\SessionTokenHash;
use App\Domain\Identity\UserId;
use DateTimeImmutable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class SessionTest extends TestCase
{
    private const string START = '2026-10-02 10:00:00';

    #[DataProvider('idleCases')]
    public function test_should_expire_after_two_hours_without_activity(string $elapsed, bool $expired): void
    {
        $session = $this->sessionStartedAt(self::START);

        self::assertSame($expired, $session->isExpiredAt(self::at(self::START, $elapsed), SessionPolicy::standard()));
    }

    /** @return iterable<string, array{string, bool}> */
    public static function idleCases(): iterable
    {
        yield 'just started' => ['+0 seconds', false];
        yield 'one second before the idle limit' => ['+7199 seconds', false];
        yield 'exactly at the idle limit' => ['+2 hours', true];
    }

    public function test_should_stay_alive_when_there_is_regular_activity(): void
    {
        $session = $this->sessionStartedAt(self::START);

        $session->touch(self::at(self::START, '+90 minutes'));

        self::assertFalse($session->isExpiredAt(self::at(self::START, '+3 hours'), SessionPolicy::standard()));
    }

    public function test_should_expire_after_twelve_hours_even_with_constant_activity(): void
    {
        $session = $this->sessionStartedAt(self::START);
        for ($minutes = 60; $minutes < 720; $minutes += 60) {
            $session->touch(self::at(self::START, "+{$minutes} minutes"));
        }

        self::assertFalse($session->isExpiredAt(self::at(self::START, '+11 hours 59 minutes'), SessionPolicy::standard()));
        self::assertTrue($session->isExpiredAt(self::at(self::START, '+12 hours'), SessionPolicy::standard()));
    }

    public function test_should_record_activity_only_when_more_than_a_minute_has_passed(): void
    {
        $session = $this->sessionStartedAt(self::START);

        self::assertFalse($session->touch(self::at(self::START, '+59 seconds')));
        self::assertEquals(self::at(self::START, '+0 seconds'), $session->lastActivityAt());

        self::assertTrue($session->touch(self::at(self::START, '+61 seconds')));
        self::assertEquals(self::at(self::START, '+61 seconds'), $session->lastActivityAt());
    }

    private function sessionStartedAt(string $start): Session
    {
        return Session::start(SessionId::generate(), new SessionTokenHash(str_repeat('a', 64)), UserId::generate(), new DateTimeImmutable($start));
    }

    private function at(string $start, string $elapsed): DateTimeImmutable
    {
        return new DateTimeImmutable($start)->modify($elapsed);
    }
}

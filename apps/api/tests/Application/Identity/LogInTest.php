<?php

declare(strict_types=1);

namespace App\Tests\Application\Identity;

use App\Application\Identity\Error\InvalidCredentials;
use App\Application\Identity\Error\TooManyLoginAttempts;
use App\Application\Identity\LogIn;
use App\Domain\Identity\Role;
use App\Tests\Support\Identity\IdentityFixture;
use PHPUnit\Framework\TestCase;

final class LogInTest extends TestCase
{
    private IdentityFixture $fx;
    private LogIn $logIn;

    protected function setUp(): void
    {
        $this->fx = new IdentityFixture();
        $this->logIn = new LogIn($this->fx->users, $this->fx->sessions, $this->fx->hasher, $this->fx->tokens, $this->fx->limiter, $this->fx->log, $this->fx->clock);
    }

    public function test_should_start_a_session_when_the_credentials_are_correct(): void
    {
        $user = $this->fx->existingUser();

        $result = ($this->logIn)('  JUNTA@club.es', IdentityFixture::PASSWORD, '10.0.0.1');

        self::assertSame('token-1', $result->token->value);
        self::assertSame($user->id()->value, $result->user->id);
        self::assertSame(Role::Administrator, $result->user->role);
        self::assertCount(1, $this->fx->sessions->forUser($user->id()));
        self::assertSame([['event' => 'login', 'outcome' => 'success', 'userId' => $user->id()->value]], $this->fx->log->events);
    }

    public function test_should_reject_and_count_a_failure_when_the_password_is_wrong(): void
    {
        $this->fx->existingUser();

        $this->assertInvalidCredentials('contraseña-incorrecta');
        self::assertSame(1, $this->fx->limiter->failures[IdentityFixture::EMAIL]);
    }

    public function test_should_reject_with_the_same_error_and_still_verify_a_hash_when_the_email_is_unknown(): void
    {
        $this->assertInvalidCredentials(IdentityFixture::PASSWORD, 'nadie@club.es');
        self::assertSame(1, $this->fx->hasher->verifications);
    }

    public function test_should_reject_with_the_same_error_when_the_email_is_malformed(): void
    {
        $this->assertInvalidCredentials(IdentityFixture::PASSWORD, 'no-es-un-email');
    }

    public function test_should_reject_with_the_same_error_when_the_account_is_disabled(): void
    {
        $user = $this->fx->existingUser();
        $user->disable();

        $this->assertInvalidCredentials(IdentityFixture::PASSWORD);
        self::assertSame([], $this->fx->sessions->forUser($user->id()));
    }

    public function test_should_refuse_without_checking_the_password_when_attempts_are_exhausted(): void
    {
        $this->fx->existingUser();
        $this->fx->limiter->failures[IdentityFixture::EMAIL] = 5;

        $this->expectException(TooManyLoginAttempts::class);

        try {
            ($this->logIn)(IdentityFixture::EMAIL, IdentityFixture::PASSWORD, '10.0.0.1');
        } finally {
            self::assertSame(0, $this->fx->hasher->verifications);
        }
    }

    public function test_should_reset_the_failure_counter_when_login_succeeds(): void
    {
        $this->fx->existingUser();
        $this->fx->limiter->failures[IdentityFixture::EMAIL] = 3;

        ($this->logIn)(IdentityFixture::EMAIL, IdentityFixture::PASSWORD, '10.0.0.1');

        self::assertArrayNotHasKey(IdentityFixture::EMAIL, $this->fx->limiter->failures);
    }

    public function test_should_upgrade_the_stored_hash_when_it_uses_an_outdated_algorithm(): void
    {
        $user = $this->fx->existingUser(passwordHash: 'old:'.IdentityFixture::PASSWORD);

        ($this->logIn)(IdentityFixture::EMAIL, IdentityFixture::PASSWORD, '10.0.0.1');

        self::assertSame('hashed:'.IdentityFixture::PASSWORD, $this->fx->users->find($user->id())?->passwordHash()->value);
    }

    public function test_should_report_a_pending_password_change_when_the_account_has_a_temporary_password(): void
    {
        $this->fx->existingUser(mustChangePassword: true);

        $result = ($this->logIn)(IdentityFixture::EMAIL, IdentityFixture::PASSWORD, '10.0.0.1');

        self::assertTrue($result->user->mustChangePassword);
    }

    private function assertInvalidCredentials(string $password, string $email = IdentityFixture::EMAIL): void
    {
        try {
            ($this->logIn)($email, $password, '10.0.0.1');
            self::fail('Se esperaba InvalidCredentials');
        } catch (InvalidCredentials $error) {
            self::assertSame('Email o contraseña incorrectos.', $error->getMessage());
            self::assertSame('failure', $this->fx->log->events[0]['outcome'] ?? null);
        }
    }
}

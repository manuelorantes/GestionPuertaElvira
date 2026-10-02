<?php

declare(strict_types=1);

namespace App\Tests\Application\Identity;

use App\Application\Identity\ChangeOwnPassword;
use App\Application\Identity\Error\CurrentPasswordMismatch;
use App\Application\Identity\LogIn;
use App\Domain\Identity\Error\WeakPassword;
use App\Tests\Support\Identity\IdentityFixture;
use PHPUnit\Framework\TestCase;

final class ChangeOwnPasswordTest extends TestCase
{
    private IdentityFixture $fx;
    private ChangeOwnPassword $change;

    protected function setUp(): void
    {
        $this->fx = new IdentityFixture();
        $this->change = new ChangeOwnPassword($this->fx->users, $this->fx->sessions, $this->fx->hasher, $this->fx->log, $this->fx->clock);
    }

    public function test_should_store_the_new_password_and_close_other_sessions_when_valid(): void
    {
        $user = $this->fx->existingUser(mustChangePassword: true);
        $current = $this->logIn()->user;
        $this->logIn();

        ($this->change)($user->id()->value, $current->sessionId, IdentityFixture::PASSWORD, 'nueva-defensa-siciliana');

        $stored = $this->fx->users->find($user->id());
        self::assertSame('hashed:nueva-defensa-siciliana', $stored?->passwordHash()->value);
        self::assertFalse($stored->mustChangePassword());
        $remaining = $this->fx->sessions->forUser($user->id());
        self::assertCount(1, $remaining);
        self::assertSame($current->sessionId, $remaining[0]->id()->value);
    }

    public function test_should_refuse_when_the_current_password_is_wrong(): void
    {
        $user = $this->fx->existingUser();

        $this->expectException(CurrentPasswordMismatch::class);

        ($this->change)($user->id()->value, $this->logIn()->user->sessionId, 'otra-cosa-distinta', 'nueva-defensa-siciliana');
    }

    public function test_should_refuse_when_the_new_password_breaks_the_policy(): void
    {
        $user = $this->fx->existingUser();

        $this->expectException(WeakPassword::class);

        ($this->change)($user->id()->value, $this->logIn()->user->sessionId, IdentityFixture::PASSWORD, 'corta');
    }

    private function logIn(): \App\Application\Identity\LoginResult
    {
        return new LogIn($this->fx->users, $this->fx->sessions, $this->fx->hasher, $this->fx->tokens, $this->fx->limiter, $this->fx->log, $this->fx->clock)(IdentityFixture::EMAIL, IdentityFixture::PASSWORD, '10.0.0.1');
    }
}

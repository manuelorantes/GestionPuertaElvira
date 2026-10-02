<?php

declare(strict_types=1);

namespace App\Tests\Application\Identity;

use App\Application\Identity\LogIn;
use App\Application\Identity\LogOut;
use App\Tests\Support\Identity\IdentityFixture;
use PHPUnit\Framework\TestCase;

final class LogOutTest extends TestCase
{
    public function test_should_end_the_session_and_be_harmless_when_repeated(): void
    {
        $fx = new IdentityFixture();
        $user = $fx->existingUser();
        $login = new LogIn($fx->users, $fx->sessions, $fx->hasher, $fx->tokens, $fx->limiter, $fx->log, $fx->clock);
        $token = $login(IdentityFixture::EMAIL, IdentityFixture::PASSWORD, '10.0.0.1')->token;
        $logOut = new LogOut($fx->sessions, $fx->tokens, $fx->log);

        $logOut($token->value);
        $logOut($token->value);

        self::assertSame([], $fx->sessions->forUser($user->id()));
        self::assertSame(['event' => 'logout', 'outcome' => 'success', 'userId' => $user->id()->value], $fx->log->events[1]);
    }
}

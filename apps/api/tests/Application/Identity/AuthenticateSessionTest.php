<?php

declare(strict_types=1);

namespace App\Tests\Application\Identity;

use App\Application\Identity\AuthenticateSession;
use App\Application\Identity\Error\SessionNotValid;
use App\Application\Identity\SessionToken;
use App\Domain\Identity\Session;
use App\Domain\Identity\SessionId;
use App\Domain\Identity\User;
use App\Tests\Support\Identity\IdentityFixture;
use PHPUnit\Framework\TestCase;

final class AuthenticateSessionTest extends TestCase
{
    private IdentityFixture $fx;
    private AuthenticateSession $authenticate;
    private User $user;

    protected function setUp(): void
    {
        $this->fx = new IdentityFixture();
        $this->authenticate = new AuthenticateSession($this->fx->sessions, $this->fx->users, $this->fx->tokens, $this->fx->clock);
        $this->user = $this->fx->existingUser();
    }

    public function test_should_identify_the_user_when_the_session_is_valid(): void
    {
        $session = $this->sessionFor('token-a');

        $authenticated = ($this->authenticate)('token-a');

        self::assertSame($this->user->id()->value, $authenticated->id);
        self::assertSame($session->id()->value, $authenticated->sessionId);
    }

    public function test_should_record_activity_when_the_session_is_used(): void
    {
        $this->sessionFor('token-a');
        $this->fx->clock->advance('+30 minutes');

        ($this->authenticate)('token-a');

        self::assertEquals($this->fx->clock->now(), $this->fx->sessions->forUser($this->user->id())[0]->lastActivityAt());
    }

    public function test_should_reject_when_the_token_is_unknown(): void
    {
        $this->expectException(SessionNotValid::class);

        ($this->authenticate)('token-desconocido');
    }

    public function test_should_reject_and_remove_the_session_when_it_has_expired(): void
    {
        $this->sessionFor('token-a');
        $this->fx->clock->advance('+2 hours');

        try {
            ($this->authenticate)('token-a');
            self::fail('Se esperaba SessionNotValid');
        } catch (SessionNotValid) {
            self::assertSame([], $this->fx->sessions->forUser($this->user->id()));
        }
    }

    public function test_should_reject_when_the_account_has_been_disabled(): void
    {
        $this->sessionFor('token-a');
        $this->user->disable();

        $this->expectException(SessionNotValid::class);

        ($this->authenticate)('token-a');
    }

    private function sessionFor(string $token): Session
    {
        $session = Session::start(SessionId::generate(), $this->fx->tokens->hash(new SessionToken($token)), $this->user->id(), $this->fx->clock->now());
        $this->fx->sessions->save($session);

        return $session;
    }
}

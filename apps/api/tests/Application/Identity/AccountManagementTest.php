<?php

declare(strict_types=1);

namespace App\Tests\Application\Identity;

use App\Application\Identity\ChangeUserRole;
use App\Application\Identity\DisableUser;
use App\Application\Identity\EnableUser;
use App\Application\Identity\Error\EmailAlreadyRegistered;
use App\Application\Identity\Error\UserNotFound;
use App\Application\Identity\LogIn;
use App\Application\Identity\RegisterUser;
use App\Application\Identity\ResetUserPassword;
use App\Domain\Common\InvalidValue;
use App\Domain\Identity\AccountStatus;
use App\Domain\Identity\EmailAddress;
use App\Domain\Identity\Role;
use App\Tests\Support\Identity\FixedTemporaryPasswordGenerator;
use App\Tests\Support\Identity\IdentityFixture;
use PHPUnit\Framework\TestCase;

final class AccountManagementTest extends TestCase
{
    private IdentityFixture $fx;

    protected function setUp(): void
    {
        $this->fx = new IdentityFixture();
    }

    public function test_should_register_an_account_with_a_temporary_password_to_be_changed(): void
    {
        $temporary = $this->register('Profe@Club.es', 'Carlos Ruiz Márquez', 'teacher');

        $user = $this->fx->users->findByEmail(EmailAddress::fromString('profe@club.es'));
        self::assertSame(FixedTemporaryPasswordGenerator::PASSWORD, $temporary);
        self::assertSame(Role::Teacher, $user?->role());
        self::assertTrue($user->mustChangePassword());
        self::assertSame('hashed:'.$temporary, $user->passwordHash()->value);
    }

    public function test_should_refuse_to_register_when_the_email_is_taken(): void
    {
        $this->fx->existingUser();

        $this->expectException(EmailAlreadyRegistered::class);

        $this->register(IdentityFixture::EMAIL, 'Otra Persona', 'administrator');
    }

    public function test_should_refuse_to_register_when_the_role_is_unknown(): void
    {
        $this->expectException(InvalidValue::class);

        $this->register('nuevo@club.es', 'Otra Persona', 'superuser');
    }

    public function test_should_close_every_session_when_the_account_is_disabled(): void
    {
        $user = $this->fx->existingUser();
        $this->logIn();

        new DisableUser($this->fx->users, $this->fx->sessions, $this->fx->log)(IdentityFixture::EMAIL);

        self::assertSame(AccountStatus::Disabled, $this->fx->users->find($user->id())?->status());
        self::assertSame([], $this->fx->sessions->forUser($user->id()));
    }

    public function test_should_allow_access_again_when_the_account_is_enabled(): void
    {
        $user = $this->fx->existingUser();
        $user->disable();

        new EnableUser($this->fx->users, $this->fx->log)(IdentityFixture::EMAIL);

        self::assertTrue($this->fx->users->find($user->id())?->canAuthenticate());
    }

    public function test_should_issue_a_temporary_password_and_close_sessions_when_resetting(): void
    {
        $user = $this->fx->existingUser();
        $this->logIn();

        $temporary = new ResetUserPassword($this->fx->users, $this->fx->sessions, $this->fx->hasher, $this->fx->temporaryPasswords, $this->fx->log, $this->fx->clock)(IdentityFixture::EMAIL);

        $stored = $this->fx->users->find($user->id());
        self::assertSame('hashed:'.$temporary, $stored?->passwordHash()->value);
        self::assertTrue($stored->mustChangePassword());
        self::assertSame([], $this->fx->sessions->forUser($user->id()));
    }

    public function test_should_change_the_role_when_requested(): void
    {
        $user = $this->fx->existingUser();

        new ChangeUserRole($this->fx->users, $this->fx->log)(IdentityFixture::EMAIL, 'teacher');

        self::assertSame(Role::Teacher, $this->fx->users->find($user->id())?->role());
    }

    public function test_should_fail_clearly_when_managing_an_unknown_account(): void
    {
        $this->expectException(UserNotFound::class);

        new DisableUser($this->fx->users, $this->fx->sessions, $this->fx->log)('nadie@club.es');
    }

    private function register(string $email, string $name, string $role): string
    {
        return new RegisterUser($this->fx->users, $this->fx->hasher, $this->fx->temporaryPasswords, $this->fx->log, $this->fx->clock)($email, $name, $role);
    }

    private function logIn(): void
    {
        new LogIn($this->fx->users, $this->fx->sessions, $this->fx->hasher, $this->fx->tokens, $this->fx->limiter, $this->fx->log, $this->fx->clock)(IdentityFixture::EMAIL, IdentityFixture::PASSWORD, '10.0.0.1');
    }
}

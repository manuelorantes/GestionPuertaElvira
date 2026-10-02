<?php

declare(strict_types=1);

namespace App\Tests\Domain\Identity;

use App\Domain\Identity\AccountStatus;
use App\Domain\Identity\EmailAddress;
use App\Domain\Identity\Event\UserDisabled;
use App\Domain\Identity\Event\UserPasswordChanged;
use App\Domain\Identity\Event\UserPasswordReset;
use App\Domain\Identity\Event\UserRegistered;
use App\Domain\Identity\FullName;
use App\Domain\Identity\PasswordHash;
use App\Domain\Identity\Role;
use App\Domain\Identity\User;
use App\Domain\Identity\UserId;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

final class UserTest extends TestCase
{
    private DateTimeImmutable $now;

    protected function setUp(): void
    {
        $this->now = new DateTimeImmutable('2026-10-02 10:00:00');
    }

    public function test_should_be_active_and_require_a_password_change_when_registered(): void
    {
        $user = $this->registeredUser();

        self::assertSame(AccountStatus::Active, $user->status());
        self::assertTrue($user->mustChangePassword());
        self::assertTrue($user->canAuthenticate());
        self::assertEquals([new UserRegistered($user->id(), Role::Administrator)], $user->releaseEvents());
    }

    public function test_should_no_longer_require_a_change_when_the_password_is_changed(): void
    {
        $user = $this->registeredUser();
        $later = $this->now->modify('+1 hour');

        $user->changePassword(new PasswordHash('new-hash'), $later);

        self::assertFalse($user->mustChangePassword());
        self::assertEquals(new PasswordHash('new-hash'), $user->passwordHash());
        self::assertEquals($later, $user->passwordChangedAt());
        self::assertContainsEquals(new UserPasswordChanged($user->id()), $user->releaseEvents());
    }

    public function test_should_require_a_change_again_when_the_password_is_reset(): void
    {
        $user = $this->registeredUser();
        $user->changePassword(new PasswordHash('chosen-hash'), $this->now);

        $user->resetPassword(new PasswordHash('temporary-hash'), $this->now);

        self::assertTrue($user->mustChangePassword());
        self::assertContainsEquals(new UserPasswordReset($user->id()), $user->releaseEvents());
    }

    public function test_should_not_authenticate_when_disabled_and_again_when_enabled(): void
    {
        $user = $this->registeredUser();

        $user->disable();
        self::assertFalse($user->canAuthenticate());
        self::assertContainsEquals(new UserDisabled($user->id()), $user->releaseEvents());

        $user->enable();
        self::assertTrue($user->canAuthenticate());
    }

    public function test_should_change_the_role_when_requested(): void
    {
        $user = $this->registeredUser();

        $user->changeRole(Role::Teacher);

        self::assertSame(Role::Teacher, $user->role());
    }

    public function test_should_release_events_only_once(): void
    {
        $user = $this->registeredUser();
        $user->releaseEvents();

        self::assertSame([], $user->releaseEvents());
    }

    private function registeredUser(): User
    {
        return User::register(
            UserId::generate(),
            EmailAddress::fromString('junta@club.es'),
            FullName::fromString('Lucía Moreno Gil'),
            Role::Administrator,
            new PasswordHash('temporary-hash'),
            $this->now,
        );
    }
}

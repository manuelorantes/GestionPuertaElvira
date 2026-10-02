<?php

declare(strict_types=1);

namespace App\Tests\Domain\Identity;

use App\Domain\Identity\EmailAddress;
use App\Domain\Identity\Error\WeakPassword;
use App\Domain\Identity\PasswordPolicy;
use App\Domain\Identity\PlainPassword;
use PHPUnit\Framework\TestCase;

final class PasswordPolicyTest extends TestCase
{
    private EmailAddress $email;

    protected function setUp(): void
    {
        $this->email = EmailAddress::fromString('junta@club.es');
    }

    public function test_should_accept_when_the_password_has_twelve_characters(): void
    {
        new PasswordPolicy()->assertAcceptable(PlainPassword::fromString('caballo-alfil'), $this->email);

        $this->addToAssertionCount(1);
    }

    public function test_should_reject_when_the_password_is_shorter_than_twelve_characters(): void
    {
        $this->expectExceptionObject(WeakPassword::tooShort(12));

        new PasswordPolicy()->assertAcceptable(PlainPassword::fromString('enroque-123'), $this->email);
    }

    public function test_should_reject_when_the_password_matches_the_email(): void
    {
        $this->expectExceptionObject(WeakPassword::sameAsEmail());

        new PasswordPolicy()->assertAcceptable(PlainPassword::fromString('Junta@Club.es'), $this->email);
    }
}

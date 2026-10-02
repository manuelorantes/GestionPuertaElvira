<?php

declare(strict_types=1);

namespace App\Domain\Identity;

use App\Domain\Common\EmailAddress;
use App\Domain\Identity\Error\WeakPassword;

final readonly class PasswordPolicy
{
    public const int MIN_LENGTH = 12;

    public function assertAcceptable(PlainPassword $password, EmailAddress $owner): void
    {
        if ($password->length() < self::MIN_LENGTH) {
            throw WeakPassword::tooShort(self::MIN_LENGTH);
        }

        if (mb_strtolower(trim($password->reveal())) === $owner->value) {
            throw WeakPassword::sameAsEmail();
        }
    }
}

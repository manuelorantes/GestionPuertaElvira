<?php

declare(strict_types=1);

namespace App\Application\Identity;

final readonly class LoginResult
{
    public function __construct(public SessionToken $token, public AuthenticatedUser $user)
    {
    }
}

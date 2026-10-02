<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Http;

use App\Application\Identity\AuthenticatedUser;

final readonly class UserPresenter
{
    /** @return array{user: array{id: string, fullName: string, email: string, role: string, mustChangePassword: bool}} */
    public static function present(AuthenticatedUser $user): array
    {
        return ['user' => [
            'id' => $user->id,
            'fullName' => $user->fullName,
            'email' => $user->email,
            'role' => $user->role->value,
            'mustChangePassword' => $user->mustChangePassword,
        ]];
    }
}

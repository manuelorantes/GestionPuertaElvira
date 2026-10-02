<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Http;

use App\Application\Identity\AuthenticatedUser;
use App\Domain\Identity\Role;
use Deprecated;
use LogicException;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * Adaptador entre el usuario autenticado de la aplicación y Symfony Security.
 */
final readonly class SessionUser implements UserInterface
{
    private const array ROLES = [
        Role::Administrator->value => ['ROLE_USER', 'ROLE_ADMIN'],
        Role::Teacher->value => ['ROLE_USER', 'ROLE_TEACHER'],
    ];

    public function __construct(public AuthenticatedUser $user)
    {
    }

    public function getRoles(): array
    {
        return self::ROLES[$this->user->role->value];
    }

    /** @return non-empty-string */
    public function getUserIdentifier(): string
    {
        return '' !== $this->user->id ? $this->user->id : throw new LogicException('Usuario sin identificador');
    }

    #[Deprecated('No guarda credenciales en memoria')]
    public function eraseCredentials(): void
    {
    }
}

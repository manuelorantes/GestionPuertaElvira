<?php

declare(strict_types=1);

namespace App\Domain\Identity;

use App\Domain\Common\InvalidValue;

enum Role: string
{
    /** Administra el club y, además, puede ver el historial y deshacer o volver atrás. */
    case Superadministrator = 'superadministrator';
    case Administrator = 'administrator';
    case Teacher = 'teacher';

    public static function fromName(string $name): self
    {
        return self::tryFrom($name) ?? throw new InvalidValue('role', 'Rol desconocido: usa superadministrator, administrator o teacher.');
    }
}

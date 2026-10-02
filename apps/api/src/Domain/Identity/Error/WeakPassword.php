<?php

declare(strict_types=1);

namespace App\Domain\Identity\Error;

use DomainException;

final class WeakPassword extends DomainException
{
    public static function tooShort(int $minimum): self
    {
        return new self(\sprintf('La contraseña debe tener al menos %d caracteres.', $minimum));
    }

    public static function sameAsEmail(): self
    {
        return new self('La contraseña no puede ser igual que tu email.');
    }
}

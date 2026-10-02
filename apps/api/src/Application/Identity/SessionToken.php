<?php

declare(strict_types=1);

namespace App\Application\Identity;

use SensitiveParameter;
use Stringable;

/**
 * Token de sesión en claro: solo existe en memoria y en la cookie del navegador.
 */
final readonly class SessionToken implements Stringable
{
    public function __construct(#[SensitiveParameter] public string $value)
    {
    }

    public function __toString(): string
    {
        return '[oculto]';
    }
}

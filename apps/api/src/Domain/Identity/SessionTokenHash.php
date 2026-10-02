<?php

declare(strict_types=1);

namespace App\Domain\Identity;

use Webmozart\Assert\Assert;

/**
 * Huella del token de sesión. El token en claro solo existe en la cookie del navegador.
 */
final readonly class SessionTokenHash
{
    public function __construct(public string $value)
    {
        Assert::regex($value, '/^[0-9a-f]{64}$/');
    }
}

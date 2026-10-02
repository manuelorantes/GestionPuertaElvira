<?php

declare(strict_types=1);

namespace App\Domain\Identity;

use Webmozart\Assert\Assert;

/**
 * Hash opaco de una contraseña: el dominio no conoce el algoritmo.
 */
final readonly class PasswordHash
{
    public function __construct(public string $value)
    {
        Assert::notEmpty($value);
    }
}

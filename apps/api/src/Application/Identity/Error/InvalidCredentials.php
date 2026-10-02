<?php

declare(strict_types=1);

namespace App\Application\Identity\Error;

use RuntimeException;

/**
 * Email desconocido, contraseña incorrecta o cuenta desactivada: se informa igual en los tres casos.
 */
final class InvalidCredentials extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Email o contraseña incorrectos.');
    }
}

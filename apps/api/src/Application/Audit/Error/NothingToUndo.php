<?php

declare(strict_types=1);

namespace App\Application\Audit\Error;

use RuntimeException;

final class NothingToUndo extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Esa acción no tiene cambios que se puedan deshacer.');
    }
}

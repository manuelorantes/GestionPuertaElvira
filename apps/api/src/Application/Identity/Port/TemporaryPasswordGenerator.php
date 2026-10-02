<?php

declare(strict_types=1);

namespace App\Application\Identity\Port;

use App\Domain\Identity\PlainPassword;

interface TemporaryPasswordGenerator
{
    /** Genera una contraseña que cumple la política y es fácil de dictar. */
    public function generate(): PlainPassword;
}

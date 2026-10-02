<?php

declare(strict_types=1);

namespace App\Application\Identity\Port;

use App\Domain\Identity\UserId;

/**
 * Registro de eventos de seguridad. Nunca recibe emails ni contraseñas.
 */
interface SecurityEventLog
{
    public function record(string $event, string $outcome, ?UserId $userId = null): void;
}

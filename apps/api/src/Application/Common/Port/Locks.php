<?php

declare(strict_types=1);

namespace App\Application\Common\Port;

/**
 * Bloqueo con nombre hasta el final de la transacción en curso: dos peticiones sobre lo mismo
 * (un doble clic, dos pestañas) se atienden una detrás de otra, y la segunda ve lo que hizo la primera.
 */
interface Locks
{
    public function acquire(string $key): void;
}

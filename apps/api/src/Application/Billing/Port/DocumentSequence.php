<?php

declare(strict_types=1);

namespace App\Application\Billing\Port;

/** Contador correlativo sin huecos por tipo de documento y temporada; se llama dentro de una transacción. */
interface DocumentSequence
{
    public function next(string $prefix, int $seasonYear): int;
}

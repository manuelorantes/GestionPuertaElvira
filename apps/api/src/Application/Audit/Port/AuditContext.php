<?php

declare(strict_types=1);

namespace App\Application\Audit\Port;

/** Etiqueta de la acción del historial en curso (por defecto la da la ruta). */
interface AuditContext
{
    public function relabel(string $label): void;
}

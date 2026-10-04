<?php

declare(strict_types=1);

namespace App\Application\Audit;

use App\Domain\Common\Uuid;

/** Identificador de una acción del historial. */
final readonly class AuditActionId extends Uuid
{
}

<?php

declare(strict_types=1);

namespace App\Domain\Common;

/**
 * Error operacional que aporta datos estructurados para que la persona usuaria pueda actuar
 * (p. ej. con qué grupo coincide un horario). Nunca debe incluir datos personales sensibles.
 */
interface HasErrorDetails
{
    /** @return array<string, scalar|null> */
    public function details(): array;
}

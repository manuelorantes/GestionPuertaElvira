<?php

declare(strict_types=1);

namespace App\Domain\Common;

use DomainException;

/**
 * Un valor de entrada no cumple las reglas de un value object. Es un error operacional:
 * se traduce a una respuesta 422 en el borde HTTP.
 */
final class InvalidValue extends DomainException implements HasErrorDetails
{
    public function __construct(public readonly string $field, string $message)
    {
        parent::__construct($message);
    }

    public function details(): array
    {
        return ['field' => $this->field];
    }
}

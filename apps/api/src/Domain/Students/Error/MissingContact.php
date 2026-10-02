<?php

declare(strict_types=1);

namespace App\Domain\Students\Error;

use App\Domain\Common\HasErrorDetails;
use DomainException;

final class MissingContact extends DomainException implements HasErrorDetails
{
    private function __construct(string $message, private readonly string $field)
    {
        parent::__construct($message);
    }

    public static function minorWithoutGuardian(): self
    {
        return new self('Un alumno menor de edad necesita al menos un tutor con teléfono.', 'guardians');
    }

    public static function adultWithoutPhone(): self
    {
        return new self('Sin tutor, el alumno necesita su propio teléfono de contacto.', 'ownPhone');
    }

    public function details(): array
    {
        return ['field' => $this->field];
    }
}

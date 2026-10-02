<?php

declare(strict_types=1);

namespace App\Domain\Classes;

/** Si la persona ha confirmado expresamente inscribir por encima de las plazas. */
enum OverCapacity
{
    case Confirmed;
    case NotConfirmed;

    public static function fromConfirmation(bool $confirmed): self
    {
        return $confirmed ? self::Confirmed : self::NotConfirmed;
    }
}

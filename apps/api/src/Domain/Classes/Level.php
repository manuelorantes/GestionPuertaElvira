<?php

declare(strict_types=1);

namespace App\Domain\Classes;

use App\Domain\Common\InvalidValue;

enum Level: string
{
    case Beginner = 'beginner';
    case Intermediate = 'intermediate';
    case Advanced = 'advanced';
    case Juniors = 'juniors';
    case Adults = 'adults';
    case PrivateLesson = 'private_lesson';

    public static function fromName(string $name): self
    {
        return self::tryFrom($name) ?? throw new InvalidValue('level', 'Nivel desconocido.');
    }
}

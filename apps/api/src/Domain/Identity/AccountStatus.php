<?php

declare(strict_types=1);

namespace App\Domain\Identity;

enum AccountStatus: string
{
    case Active = 'active';
    case Disabled = 'disabled';
}

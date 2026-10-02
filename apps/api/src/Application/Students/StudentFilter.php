<?php

declare(strict_types=1);

namespace App\Application\Students;

enum StudentFilter: string
{
    case All = 'all';
    case Active = 'active';
    case Withdrawn = 'withdrawn';
    case Siblings = 'siblings';
}

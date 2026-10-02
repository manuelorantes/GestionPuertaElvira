<?php

declare(strict_types=1);

namespace App\Domain\Students;

use App\Domain\Common\FullName;
use App\Domain\Common\PhoneNumber;

/** Tutor legal de contacto. */
final readonly class Guardian
{
    public function __construct(public FullName $name, public PhoneNumber $phone)
    {
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Accounting\Error;

use RuntimeException;

final class SeasonNotFinished extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('La temporada solo se puede cerrar a partir de su último mes (agosto).');
    }
}

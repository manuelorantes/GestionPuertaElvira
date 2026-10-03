<?php

declare(strict_types=1);

namespace App\Application\Accounting\Error;

use RuntimeException;

final class SeasonAlreadyClosed extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Esa temporada ya está cerrada.');
    }
}

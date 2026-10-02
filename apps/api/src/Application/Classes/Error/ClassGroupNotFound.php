<?php

declare(strict_types=1);

namespace App\Application\Classes\Error;

use RuntimeException;

final class ClassGroupNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('No existe ese grupo.');
    }
}

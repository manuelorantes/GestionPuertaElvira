<?php

declare(strict_types=1);

namespace App\Application\Health\Port;

interface DatabaseHealth
{
    public function isReachable(): bool;
}

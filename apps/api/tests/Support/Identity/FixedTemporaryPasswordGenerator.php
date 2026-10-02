<?php

declare(strict_types=1);

namespace App\Tests\Support\Identity;

use App\Application\Identity\Port\TemporaryPasswordGenerator;
use App\Domain\Identity\PlainPassword;

final class FixedTemporaryPasswordGenerator implements TemporaryPasswordGenerator
{
    public const string PASSWORD = 'temporal-peon-c4';

    public function generate(): PlainPassword
    {
        return PlainPassword::fromString(self::PASSWORD);
    }
}

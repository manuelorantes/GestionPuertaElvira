<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Security;

use App\Application\Identity\Port\TemporaryPasswordGenerator;
use App\Domain\Identity\PlainPassword;

/**
 * Contraseñas temporales fáciles de dictar: 4 grupos de 4 caracteres sin ambigüedades (sin i, l, o, 0, 1).
 */
final readonly class RandomTemporaryPasswordGenerator implements TemporaryPasswordGenerator
{
    private const string ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

    public function generate(): PlainPassword
    {
        $groups = [];
        for ($group = 0; $group < 4; ++$group) {
            $chars = '';
            for ($i = 0; $i < 4; ++$i) {
                $chars .= self::ALPHABET[random_int(0, \strlen(self::ALPHABET) - 1)];
            }
            $groups[] = $chars;
        }

        return PlainPassword::fromString(implode('-', $groups));
    }
}

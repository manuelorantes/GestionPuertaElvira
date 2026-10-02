<?php

declare(strict_types=1);

namespace App\Domain\Identity;

final readonly class SessionPolicy
{
    private function __construct(
        public int $idleSeconds,
        public int $absoluteSeconds,
        public int $activityResolutionSeconds,
    ) {
    }

    /**
     * 2 h sin actividad, 12 h como máximo, actividad registrada como mucho una vez por minuto.
     */
    public static function standard(): self
    {
        return new self(2 * 3600, 12 * 3600, 60);
    }
}

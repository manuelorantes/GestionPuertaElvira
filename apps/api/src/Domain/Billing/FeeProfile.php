<?php

declare(strict_types=1);

namespace App\Domain\Billing;

/** Lo que determina la cuota de un alumno: sus horas en grupos normales, sus particulares y si tiene hermanos. */
final readonly class FeeProfile
{
    /** @param list<PrivateLesson> $privateLessons */
    public function __construct(public float $regularWeeklyHours, public array $privateLessons, public bool $hasSiblings)
    {
    }
}

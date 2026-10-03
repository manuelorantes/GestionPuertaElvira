<?php

declare(strict_types=1);

namespace App\Application\Billing;

/** Inscripción del alumno en una clase particular. */
final readonly class PrivateEnrolment
{
    public function __construct(public string $groupName, public string $teacherId, public float $weeklyHours)
    {
    }
}

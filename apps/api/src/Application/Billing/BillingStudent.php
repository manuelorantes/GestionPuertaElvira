<?php

declare(strict_types=1);

namespace App\Application\Billing;

/** Lo que Billing necesita saber de un alumno, servido por Alumnado y Clases. */
final readonly class BillingStudent
{
    /** @param list<PrivateEnrolment> $privateLessons */
    public function __construct(
        public string $id,
        public string $name,
        public string $guardianName,
        public string $guardianPhone,
        public bool $hasSiblings,
        public float $regularWeeklyHours,
        public array $privateLessons,
    ) {
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Import;

/** Una fila de la hoja ya interpretada. Lo que no se entiende queda vacío y explicado en `warnings`. */
final readonly class ImportedRow
{
    /**
     * @param array<string, int> $monthlyCents cobrado cada mes (AAAA-MM → céntimos)
     * @param list<string>       $warnings
     */
    public function __construct(
        public int $line,
        public string $fullName,
        public ?string $birthDate,
        public ?string $guardianName,
        public ?string $guardianPhone,
        public ?string $email,
        public ?int $membershipCents,
        public ?int $kitCents,
        public ?int $federationCents,
        public array $monthlyCents,
        public array $warnings,
    ) {
    }
}

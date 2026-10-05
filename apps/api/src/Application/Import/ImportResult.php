<?php

declare(strict_types=1);

namespace App\Application\Import;

/** Resultado de importar una fila. */
final readonly class ImportResult
{
    public function __construct(
        public int $line,
        public string $action,
        public ?string $studentId,
        public string $studentName,
        public int $payments,
        public bool $member,
        public int $entries,
    ) {
    }
}

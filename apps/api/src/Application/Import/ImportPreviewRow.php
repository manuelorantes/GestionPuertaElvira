<?php

declare(strict_types=1);

namespace App\Application\Import;

/** Fila de la revisión: lo leído, con quién coincide y qué se propone. */
final readonly class ImportPreviewRow
{
    /** @param list<StudentCandidate> $suggestions */
    public function __construct(
        public ImportedRow $row,
        public ?StudentCandidate $match,
        public array $suggestions,
    ) {
    }
}

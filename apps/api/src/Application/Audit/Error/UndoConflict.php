<?php

declare(strict_types=1);

namespace App\Application\Audit\Error;

use App\Application\Audit\AuditActionView;
use App\Domain\Common\HasErrorDetails;
use RuntimeException;

/** Una acción posterior tocó los mismos registros: deshacer esta rompería la posterior. */
final class UndoConflict extends RuntimeException implements HasErrorDetails
{
    /** @param list<AuditActionView> $later */
    public function __construct(private readonly array $later)
    {
        $first = $later[0] ?? null;
        parent::__construct(null === $first
            ? 'Una acción posterior tocó los mismos registros.'
            : \sprintf('No se puede deshacer: «%s» (%s) tocó después los mismos registros. Deshaz antes esa o vuelve a este punto.', $first->label, $first->userName));
    }

    public function details(): array
    {
        return ['conflicts' => implode(', ', array_map(static fn (AuditActionView $a): string => $a->id, $this->later))];
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Audit;

/** Una acción del historial: quién, cuándo, qué y cuántos registros tocó. */
final readonly class AuditActionView
{
    /** @param list<string> $affected nombres legibles de lo que tocó (p. ej. «Cobro», «Cuota») */
    public function __construct(
        public string $id,
        public int $seq,
        public string $kind,
        public ?string $userId,
        public string $userName,
        public string $label,
        public string $occurredAt,
        public int $changeCount,
        public array $affected,
        public ?string $reverts,
        public bool $undoable,
    ) {
    }
}

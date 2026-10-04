<?php

declare(strict_types=1);

namespace App\Application\Audit;

/** Un registro tocado por una acción, con los campos que cambiaron (sin contraseñas). */
final readonly class AuditChangeView
{
    /**
     * @param array<string, mixed>                                    $key
     * @param list<array{field: string, before: mixed, after: mixed}> $fields
     */
    public function __construct(
        public string $table,
        public string $tableLabel,
        public array $key,
        public string $operation,
        public array $fields,
    ) {
    }
}

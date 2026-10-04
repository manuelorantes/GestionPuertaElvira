<?php

declare(strict_types=1);

namespace App\Application\Audit\Port;

use App\Application\Audit\AuditActionView;

/** Reversión de cambios registrados. Se usa dentro de una transacción. */
interface AuditReverter
{
    /** Abre la acción que firma la reversión (los cambios que haga quedan registrados con ella). */
    public function begin(string $label, string $kind, string $reverts): void;

    /** @return list<int> cambios revertibles de la acción, del más reciente al más antiguo */
    public function changesOf(string $actionId): array;

    /** @return list<int> cambios revertibles posteriores a la acción, del más reciente al más antiguo */
    public function changesAfter(string $actionId): array;

    /**
     * Acciones posteriores que tocaron alguno de los registros de esta.
     *
     * @return list<AuditActionView>
     */
    public function laterActionsTouchingTheSameRecords(string $actionId): array;

    public function revert(int $changeId): void;
}

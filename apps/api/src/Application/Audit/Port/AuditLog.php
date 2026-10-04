<?php

declare(strict_types=1);

namespace App\Application\Audit\Port;

use App\Application\Audit\AuditActionView;
use App\Application\Audit\AuditChangeView;
use App\Application\Audit\AuditFilter;

interface AuditLog
{
    /**
     * Acciones del historial, de la más reciente a la más antigua.
     *
     * @return list<AuditActionView>
     */
    public function actions(AuditFilter $filter): array;

    public function action(string $id): ?AuditActionView;

    /** @return list<AuditChangeView> */
    public function changes(string $actionId): array;

    /** @return list<array{id: string, name: string}> personas que aparecen en el historial */
    public function people(): array;
}

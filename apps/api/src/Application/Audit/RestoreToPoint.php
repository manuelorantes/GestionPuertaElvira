<?php

declare(strict_types=1);

namespace App\Application\Audit;

use App\Application\Audit\Error\AuditActionNotFound;
use App\Application\Audit\Error\NothingToUndo;
use App\Application\Audit\Port\AuditLog;
use App\Application\Audit\Port\AuditReverter;
use App\Application\Common\Port\Locks;
use App\Application\Common\Port\TransactionRunner;

/** Devuelve todos los datos del club al estado justo después de una acción, deshaciendo todo lo posterior. */
final readonly class RestoreToPoint
{
    public function __construct(
        private AuditLog $log,
        private AuditReverter $reverter,
        private TransactionRunner $transactions,
        private Locks $locks,
    ) {
    }

    /** @return int cambios revertidos */
    public function __invoke(string $actionId): int
    {
        return $this->transactions->run(function () use ($actionId): int {
            $this->locks->acquire('audit:revert');
            $action = $this->log->action($actionId) ?? throw new AuditActionNotFound();
            $changes = $this->reverter->changesAfter($actionId);
            if ([] === $changes) {
                throw new NothingToUndo();
            }

            $this->reverter->begin(\sprintf('Volver al punto: %s (%s)', $action->label, $action->userName), 'restore', $actionId);
            foreach ($changes as $change) {
                $this->reverter->revert($change);
            }

            return \count($changes);
        });
    }
}

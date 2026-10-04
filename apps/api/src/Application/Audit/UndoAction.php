<?php

declare(strict_types=1);

namespace App\Application\Audit;

use App\Application\Audit\Error\AuditActionNotFound;
use App\Application\Audit\Error\NothingToUndo;
use App\Application\Audit\Error\UndoConflict;
use App\Application\Audit\Port\AuditLog;
use App\Application\Audit\Port\AuditReverter;
use App\Application\Common\Port\Locks;
use App\Application\Common\Port\TransactionRunner;

/** Deshace una acción concreta, siempre que nada posterior haya tocado sus registros. */
final readonly class UndoAction
{
    public function __construct(
        private AuditLog $log,
        private AuditReverter $reverter,
        private TransactionRunner $transactions,
        private Locks $locks,
    ) {
    }

    public function __invoke(string $actionId): void
    {
        $this->transactions->run(function () use ($actionId): void {
            $this->locks->acquire('audit:revert');
            $action = $this->log->action($actionId) ?? throw new AuditActionNotFound();
            $changes = $this->reverter->changesOf($actionId);
            if ([] === $changes) {
                throw new NothingToUndo();
            }
            $later = $this->reverter->laterActionsTouchingTheSameRecords($actionId);
            if ([] !== $later) {
                throw new UndoConflict($later);
            }

            $this->reverter->begin('Deshacer: '.$action->label, 'undo', $actionId);
            foreach ($changes as $change) {
                $this->reverter->revert($change);
            }
        });
    }
}

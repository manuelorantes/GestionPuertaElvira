<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Application\Common\Port\TransactionRunner;

/** Marca como pagadas todas las liquidaciones pendientes del mes. Devuelve cuántas. */
final readonly class PayAllSettlements
{
    public function __construct(private PaySettlement $pay, private ListSettlements $list, private TransactionRunner $transactions)
    {
    }

    /** Todas o ninguna: si una falla, no queda ninguna marcada. */
    public function __invoke(string $month, string $paidOn): int
    {
        return $this->transactions->run(function () use ($month, $paidOn): int {
            $pending = array_filter(($this->list)($month), static fn (SettlementView $s): bool => 'pending' === $s->status && $s->minutes > 0);
            foreach ($pending as $settlement) {
                ($this->pay)($settlement->teacherId, $month, $paidOn);
            }

            return \count($pending);
        });
    }
}

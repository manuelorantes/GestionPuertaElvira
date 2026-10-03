<?php

declare(strict_types=1);

namespace App\Domain\Accounting;

use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;

/** Ingreso o gasto anotado a mano (subvención, venta de material, comisión del banco…). */
final readonly class ManualEntry
{
    private function __construct(
        public ManualEntryId $id,
        public LocalDate $date,
        public EntryKind $kind,
        public string $concept,
        public LedgerCategory $category,
        public Method $method,
        public Money $amount,
    ) {
    }

    public static function record(ManualEntryId $id, LocalDate $date, EntryKind $kind, string $concept, LedgerCategory $category, Method $method, Money $amount): self
    {
        if ('' === trim($concept)) {
            throw new InvalidValue('concept', 'Indica el concepto.');
        }
        if ($amount->cents <= 0) {
            throw new InvalidValue('amount', 'El importe debe ser mayor que cero.');
        }
        if ($category->kind() !== $kind) {
            throw new InvalidValue('category', 'La categoría no corresponde a un '.(EntryKind::Income === $kind ? 'ingreso' : 'gasto').'.');
        }

        return new self($id, $date, $kind, trim($concept), $category, $method, $amount);
    }
}

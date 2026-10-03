<?php

declare(strict_types=1);

namespace App\Domain\Accounting;

use App\Domain\Accounting\Error\InvoiceAlreadyPaid;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;

/** Factura de un proveedor del club, pendiente o pagada, con su documento. */
final class SupplierInvoice
{
    private function __construct(
        private readonly SupplierInvoiceId $id,
        private readonly LocalDate $date,
        private readonly string $number,
        private readonly string $supplier,
        private readonly string $concept,
        private readonly LedgerCategory $category,
        private readonly Money $amount,
        private ?LocalDate $paidOn,
        private ?Method $method,
        private ?Attachment $attachment,
    ) {
    }

    public static function register(SupplierInvoiceId $id, LocalDate $date, string $number, string $supplier, string $concept, LedgerCategory $category, Money $amount): self
    {
        if ('' === trim($supplier) || '' === trim($concept)) {
            throw new InvalidValue('supplier', 'Indica el proveedor y el concepto.');
        }
        if (EntryKind::Expense !== $category->kind()) {
            throw new InvalidValue('category', 'Una factura de proveedor es un gasto.');
        }
        if ($amount->cents <= 0) {
            throw new InvalidValue('amount', 'El importe debe ser mayor que cero.');
        }

        return new self($id, $date, trim($number), trim($supplier), trim($concept), $category, $amount, null, null, null);
    }

    public static function restore(SupplierInvoiceId $id, LocalDate $date, string $number, string $supplier, string $concept, LedgerCategory $category, Money $amount, ?LocalDate $paidOn, ?Method $method, ?Attachment $attachment): self
    {
        return new self($id, $date, $number, $supplier, $concept, $category, $amount, $paidOn, $method, $attachment);
    }

    public function pay(LocalDate $on, Method $method): void
    {
        if (null !== $this->paidOn) {
            throw new InvoiceAlreadyPaid();
        }
        $this->paidOn = $on;
        $this->method = $method;
    }

    public function attach(Attachment $attachment): ?Attachment
    {
        $previous = $this->attachment;
        $this->attachment = $attachment;

        return $previous;
    }

    public function isPaid(): bool
    {
        return null !== $this->paidOn;
    }

    public function id(): SupplierInvoiceId
    {
        return $this->id;
    }

    public function date(): LocalDate
    {
        return $this->date;
    }

    public function number(): string
    {
        return $this->number;
    }

    public function supplier(): string
    {
        return $this->supplier;
    }

    public function concept(): string
    {
        return $this->concept;
    }

    public function category(): LedgerCategory
    {
        return $this->category;
    }

    public function amount(): Money
    {
        return $this->amount;
    }

    public function paidOn(): ?LocalDate
    {
        return $this->paidOn;
    }

    public function method(): ?Method
    {
        return $this->method;
    }

    public function attachment(): ?Attachment
    {
        return $this->attachment;
    }
}

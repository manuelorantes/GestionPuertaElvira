<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Billing\Error\InvoiceAlreadyIssued;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;

/** Cobro registrado, con su recibo y, si se pide, su factura. */
final class Payment
{
    /**
     * @param list<QuoteLine> $lines
     * @param list<YearMonth> $periods
     */
    private function __construct(
        private readonly PaymentId $id,
        private readonly StudentRef $student,
        private readonly LocalDate $paidOn,
        private readonly PaymentMethod $method,
        private readonly DocumentNumber $receipt,
        private readonly ChargeKind $kind,
        private readonly string $concept,
        private readonly array $lines,
        private readonly Money $total,
        private readonly array $periods,
        private ?Invoice $invoice,
    ) {
    }

    /**
     * @param list<QuoteLine> $lines
     * @param list<YearMonth> $periods
     */
    public static function register(PaymentId $id, StudentRef $student, LocalDate $paidOn, PaymentMethod $method, DocumentNumber $receipt, ChargeKind $kind, string $concept, array $lines, Money $total, array $periods): self
    {
        return new self($id, $student, $paidOn, $method, $receipt, $kind, $concept, $lines, $total, $periods, null);
    }

    /**
     * @param list<QuoteLine> $lines
     * @param list<YearMonth> $periods
     */
    public static function restore(PaymentId $id, StudentRef $student, LocalDate $paidOn, PaymentMethod $method, DocumentNumber $receipt, ChargeKind $kind, string $concept, array $lines, Money $total, array $periods, ?Invoice $invoice): self
    {
        return new self($id, $student, $paidOn, $method, $receipt, $kind, $concept, $lines, $total, $periods, $invoice);
    }

    public function issueInvoice(DocumentNumber $number, InvoiceCustomer $customer, int $vatPercent, LocalDate $issuedOn): Invoice
    {
        if (null !== $this->invoice) {
            throw new InvoiceAlreadyIssued();
        }

        return $this->invoice = Invoice::forTotal($number, $issuedOn, $customer, $vatPercent, $this->total);
    }

    public function id(): PaymentId
    {
        return $this->id;
    }

    public function student(): StudentRef
    {
        return $this->student;
    }

    public function paidOn(): LocalDate
    {
        return $this->paidOn;
    }

    public function method(): PaymentMethod
    {
        return $this->method;
    }

    public function receipt(): DocumentNumber
    {
        return $this->receipt;
    }

    public function kind(): ChargeKind
    {
        return $this->kind;
    }

    public function concept(): string
    {
        return $this->concept;
    }

    /** @return list<QuoteLine> */
    public function lines(): array
    {
        return $this->lines;
    }

    public function total(): Money
    {
        return $this->total;
    }

    /** @return list<YearMonth> */
    public function periods(): array
    {
        return $this->periods;
    }

    public function invoice(): ?Invoice
    {
        return $this->invoice;
    }
}

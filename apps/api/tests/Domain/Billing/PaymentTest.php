<?php

declare(strict_types=1);

namespace App\Tests\Domain\Billing;

use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\DocumentNumber;
use App\Domain\Billing\Error\InvoiceAlreadyIssued;
use App\Domain\Billing\InvoiceCustomer;
use App\Domain\Billing\Payment;
use App\Domain\Billing\PaymentId;
use App\Domain\Billing\PaymentMethod;
use App\Domain\Billing\QuoteLine;
use App\Domain\Billing\StudentRef;
use App\Domain\Billing\YearMonth;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use PHPUnit\Framework\TestCase;

final class PaymentTest extends TestCase
{
    public function test_should_format_receipt_and_invoice_numbers_per_season(): void
    {
        self::assertSame('R-2026-0042', DocumentNumber::receipt(2026, 42)->toString());
        self::assertSame('F-2026-0001', DocumentNumber::invoice(2026, 1)->toString());
    }

    public function test_should_issue_one_invoice_with_vat_included_in_the_price(): void
    {
        $payment = $this->payment(Money::cents(12100));

        $invoice = $payment->issueInvoice(DocumentNumber::invoice(2026, 1), new InvoiceCustomer('Rocío Herrera', '12345678Z', 'Calle Elvira 1, Granada'), 21, LocalDate::fromString('2026-10-03'));

        self::assertSame(10000, $invoice->base->cents);
        self::assertSame(2100, $invoice->vat->cents);
        self::assertSame(12100, $invoice->total->cents);
        self::assertSame($invoice, $payment->invoice());

        $this->expectException(InvoiceAlreadyIssued::class);
        $payment->issueInvoice(DocumentNumber::invoice(2026, 2), new InvoiceCustomer('Otra', '12345678Z', 'X'), 21, LocalDate::fromString('2026-10-03'));
    }

    public function test_should_round_the_invoice_base_and_keep_the_total(): void
    {
        $invoice = $this->payment(Money::cents(4500))->issueInvoice(DocumentNumber::invoice(2026, 1), new InvoiceCustomer('A', 'B', 'C'), 21, LocalDate::fromString('2026-10-03'));

        self::assertSame(3719, $invoice->base->cents);
        self::assertSame(781, $invoice->vat->cents);
    }

    public function test_should_require_customer_data(): void
    {
        $this->expectException(InvalidValue::class);

        new InvoiceCustomer('', '12345678Z', 'Granada');
    }

    private function payment(Money $total): Payment
    {
        return Payment::register(
            PaymentId::generate(),
            StudentRef::generate(),
            LocalDate::fromString('2026-10-02'),
            PaymentMethod::Transfer,
            DocumentNumber::receipt(2026, 1),
            ChargeKind::Monthly,
            'Octubre 2026',
            [new QuoteLine('2 h semanales · 1 mes', $total)],
            $total,
            [YearMonth::fromString('2026-10')],
        );
    }
}

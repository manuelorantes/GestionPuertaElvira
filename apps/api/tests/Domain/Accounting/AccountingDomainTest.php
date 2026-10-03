<?php

declare(strict_types=1);

namespace App\Tests\Domain\Accounting;

use App\Domain\Accounting\Attachment;
use App\Domain\Accounting\EntryKind;
use App\Domain\Accounting\Error\InvoiceAlreadyPaid;
use App\Domain\Accounting\FiscalYear;
use App\Domain\Accounting\LedgerCategory;
use App\Domain\Accounting\ManualEntry;
use App\Domain\Accounting\ManualEntryId;
use App\Domain\Accounting\Method;
use App\Domain\Accounting\SeasonClosing;
use App\Domain\Accounting\SupplierInvoice;
use App\Domain\Accounting\SupplierInvoiceId;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use App\Domain\Common\YearMonth;
use PHPUnit\Framework\TestCase;

final class AccountingDomainTest extends TestCase
{
    public function test_should_run_fiscal_years_from_september_to_august(): void
    {
        $year = FiscalYear::of(LocalDate::fromString('2027-08-31'));

        self::assertSame(2026, $year->startYear);
        self::assertSame('2026/27', $year->label());
        self::assertSame('2026-09', $year->months()[0]->toString());
        self::assertSame('2027-08', $year->months()[11]->toString());
        self::assertTrue($year->includes(LocalDate::fromString('2026-09-01')));
        self::assertFalse($year->includes(LocalDate::fromString('2027-09-01')));
        self::assertSame(2027, FiscalYear::of(LocalDate::fromString('2027-09-01'))->startYear);
        self::assertTrue(FiscalYear::ofMonth(YearMonth::fromString('2027-02'))->equals($year));
    }

    public function test_should_keep_income_and_expense_categories_apart(): void
    {
        self::assertSame(EntryKind::Expense, LedgerCategory::Rent->kind());
        self::assertSame(EntryKind::Income, LedgerCategory::Grants->kind());
        self::assertSame('Federación', LedgerCategory::Federation->label());

        $this->expectException(InvalidValue::class);
        ManualEntry::record(ManualEntryId::generate(), LocalDate::fromString('2026-10-01'), EntryKind::Income, 'Alquiler', LedgerCategory::Rent, Method::Transfer, Money::euros(950));
    }

    public function test_should_require_a_positive_amount_and_a_concept(): void
    {
        $this->expectException(InvalidValue::class);

        ManualEntry::record(ManualEntryId::generate(), LocalDate::fromString('2026-10-01'), EntryKind::Expense, 'Comisión', LedgerCategory::OtherExpenses, Method::Card, Money::zero());
    }

    public function test_should_pay_an_invoice_once_and_replace_its_attachment(): void
    {
        $invoice = SupplierInvoice::register(SupplierInvoiceId::generate(), LocalDate::fromString('2026-10-01'), 'E-0912', 'Escaque Material Didáctico', 'Tablero mural', LedgerCategory::Material, Money::cents(8600));
        self::assertFalse($invoice->isPaid());

        $invoice->attach(new Attachment('invoices/a.pdf', 'factura.pdf', 'application/pdf', 1200));
        $invoice->pay(LocalDate::fromString('2026-10-03'), Method::Transfer);

        self::assertTrue($invoice->isPaid());
        self::assertSame('factura.pdf', $invoice->attachment()?->originalName);
        $this->expectException(InvoiceAlreadyPaid::class);
        $invoice->pay(LocalDate::fromString('2026-10-04'), Method::Cash);
    }

    public function test_should_only_accept_documents_and_photos_up_to_ten_megabytes(): void
    {
        $this->expectException(InvalidValue::class);

        new Attachment('invoices/a.exe', 'virus.exe', 'application/x-msdownload', 1000);
    }

    public function test_should_reject_too_big_attachments(): void
    {
        $this->expectException(InvalidValue::class);

        new Attachment('invoices/a.pdf', 'grande.pdf', 'application/pdf', 11 * 1024 * 1024);
    }

    public function test_should_close_a_season_with_its_result(): void
    {
        $closing = SeasonClosing::close(FiscalYear::of(LocalDate::fromString('2026-10-01')), Money::euros(52000), Money::euros(48000), LocalDate::fromString('2027-09-01'));

        self::assertSame(400000, $closing->result()->cents);
        self::assertTrue($closing->year()->includes(LocalDate::fromString('2027-01-15')));
    }
}

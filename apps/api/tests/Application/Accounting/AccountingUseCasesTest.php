<?php

declare(strict_types=1);

namespace App\Tests\Application\Accounting;

use App\Application\Accounting\AttachDocument;
use App\Application\Accounting\CloseSeason;
use App\Application\Accounting\DeleteEntry;
use App\Application\Accounting\DeleteInvoice;
use App\Application\Accounting\EntryInput;
use App\Application\Accounting\Error\SeasonAlreadyClosed;
use App\Application\Accounting\Error\SeasonNotFinished;
use App\Application\Accounting\FiscalYearSummary;
use App\Application\Accounting\InvoiceInput;
use App\Application\Accounting\LedgerLine;
use App\Application\Accounting\MonthLedger;
use App\Application\Accounting\PayInvoice;
use App\Application\Accounting\RecordEntry;
use App\Application\Accounting\RegisterInvoice;
use App\Application\Accounting\UploadedDocument;
use App\Application\Common\Error\PeriodClosed;
use App\Domain\Accounting\FiscalYear;
use App\Domain\Accounting\SupplierInvoiceId;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use App\Tests\Support\Accounting\AccountingFixture;
use PHPUnit\Framework\TestCase;

final class AccountingUseCasesTest extends TestCase
{
    private AccountingFixture $fx;

    protected function setUp(): void
    {
        $this->fx = new AccountingFixture('2027-09-05 10:00:00');
        $this->fx->external = [
            new LedgerLine('payment', 'p1', '2026-10-02', 'income', 'Octubre 2026 · Martina López', 'fees', 'cash', 4500),
            new LedgerLine('settlement', 's1', '2026-10-02', 'expense', 'Liquidación septiembre · Lucía Moreno', 'teachers', 'transfer', 41600),
        ];
    }

    public function test_should_list_the_month_with_income_expenses_and_spending_by_category(): void
    {
        new RecordEntry($this->fx, $this->fx)(new EntryInput('2026-10-10', 'income', 'Subvención municipal', 'grants', 'transfer', '600'));
        $invoice = $this->registerInvoice('2026-10-01', 'Alquiler octubre', 'rent', '950');
        new PayInvoice($this->fx, $this->fx)($invoice, '2026-10-01', 'transfer');

        $ledger = new MonthLedger($this->fx)('2026-10');

        self::assertSame(['2026-10-10', '2026-10-02', '2026-10-02', '2026-10-01'], array_map(static fn ($l): string => $l->date, $ledger->lines));
        self::assertSame(64500, $ledger->incomeCents);
        self::assertSame(136600, $ledger->expenseCents);
        self::assertSame([['rent', 'Alquiler', 95000], ['teachers', 'Profesores', 41600]], array_map(static fn ($c): array => [$c['category'], $c['label'], $c['amountCents']], $ledger->expensesByCategory));
    }

    public function test_should_store_replace_and_remove_invoice_documents(): void
    {
        $invoice = $this->registerInvoice('2026-10-01', 'Tablero mural', 'material', '86', new UploadedDocument('factura.pdf', 'application/pdf', '%PDF-1'));
        $first = $this->fx->invoice(SupplierInvoiceId::fromString($invoice))?->attachment()?->key;
        self::assertSame('%PDF-1', $this->fx->files[(string) $first]);

        new AttachDocument($this->fx, $this->fx, $this->fx)($invoice, new UploadedDocument('foto.jpg', 'image/jpeg', 'JPEG'));
        self::assertArrayNotHasKey((string) $first, $this->fx->files);
        self::assertCount(1, $this->fx->files);

        new DeleteInvoice($this->fx, $this->fx, $this->fx)($invoice);
        self::assertSame([], $this->fx->files);
        self::assertSame([], $this->fx->invoices);
    }

    public function test_should_summarise_the_fiscal_year_month_by_month_with_the_opening_balance(): void
    {
        $this->fx->saveClosing(\App\Domain\Accounting\SeasonClosing::close(new FiscalYear(2025), Money::euros(1000), Money::euros(400), LocalDate::fromString('2026-09-01')));
        new RecordEntry($this->fx, $this->fx)(new EntryInput('2027-02-10', 'expense', 'Comisión banco', 'other_expenses', 'card', '10'));

        $summary = new FiscalYearSummary($this->fx, $this->fx, $this->fx->clock)(2026);

        self::assertSame('2026/27', $summary->label);
        self::assertSame(60000, $summary->openingCents);
        self::assertCount(12, $summary->months);
        self::assertSame(['2026-10', 4500, 41600, -37100, 60000 - 37100], [$summary->months[1]['month'], $summary->months[1]['incomeCents'], $summary->months[1]['expenseCents'], $summary->months[1]['resultCents'], $summary->months[1]['accumulatedCents']]);
        self::assertSame(-38100, $summary->resultCents);
        self::assertTrue($summary->canClose);
        self::assertNull($summary->closedOn);
    }

    public function test_should_close_a_finished_season_once_and_lock_it(): void
    {
        $close = new CloseSeason(new FiscalYearSummary($this->fx, $this->fx, $this->fx->clock), $this->fx, $this->fx->clock);
        $close(2026);

        self::assertSame(-37100, $this->fx->closing(new FiscalYear(2026))?->result()->cents);
        try {
            new RecordEntry($this->fx, $this->fx)(new EntryInput('2027-03-01', 'income', 'Tarde', 'other_income', 'cash', '5'));
            self::fail('Debería estar bloqueado');
        } catch (PeriodClosed) {
        }
        $this->expectException(SeasonAlreadyClosed::class);
        $close(2026);
    }

    public function test_should_not_close_a_season_while_an_older_one_with_movements_is_open(): void
    {
        $this->fx->external = [new LedgerLine('payment', 'p0', '2024-10-02', 'income', 'Octubre 2024', 'fees', 'cash', 4500)];

        $this->expectException(\App\Application\Accounting\Error\PreviousSeasonOpen::class);

        new CloseSeason(new FiscalYearSummary($this->fx, $this->fx, $this->fx->clock), $this->fx, $this->fx->clock)(2026);
    }

    public function test_should_not_close_a_season_before_its_last_month(): void
    {
        $this->expectException(SeasonNotFinished::class);

        new CloseSeason(new FiscalYearSummary($this->fx, $this->fx, $this->fx->clock), $this->fx, $this->fx->clock)(2027);
    }

    public function test_should_only_delete_manual_entries_of_open_seasons(): void
    {
        $id = new RecordEntry($this->fx, $this->fx)(new EntryInput('2027-08-10', 'expense', 'Comisión banco', 'other_expenses', 'card', '10'));

        new DeleteEntry($this->fx, $this->fx)($id);

        self::assertSame([], $this->fx->entries);
    }

    private function registerInvoice(string $date, string $concept, string $category, string $amount, ?UploadedDocument $document = null): string
    {
        return new RegisterInvoice($this->fx, $this->fx, $this->fx)(new InvoiceInput($date, 'F-1', 'Proveedor', $concept, $category, $amount), $document);
    }
}

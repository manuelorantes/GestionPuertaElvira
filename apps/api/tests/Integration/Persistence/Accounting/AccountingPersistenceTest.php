<?php

declare(strict_types=1);

namespace App\Tests\Integration\Persistence\Accounting;

use App\Application\Accounting\CloseSeason;
use App\Application\Accounting\EntryInput;
use App\Application\Accounting\FiscalYearSummary;
use App\Application\Accounting\InvoiceInput;
use App\Application\Accounting\MonthLedger;
use App\Application\Accounting\PayInvoice;
use App\Application\Accounting\RecordEntry;
use App\Application\Accounting\RegisterInvoice;
use App\Application\Accounting\UploadedDocument;
use App\Application\Common\Error\PeriodClosed;
use App\Domain\Accounting\FiscalYear;
use App\Domain\Accounting\SupplierInvoiceId;
use App\Infrastructure\Accounting\LocalDocumentStorage;
use App\Infrastructure\Accounting\SqlClosedPeriods;
use App\Infrastructure\Persistence\Doctrine\Repository\Accounting\DoctrineAccountingRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class AccountingPersistenceTest extends KernelTestCase
{
    public function test_should_compose_the_ledger_from_manual_entries_and_paid_invoices(): void
    {
        $c = self::getContainer();
        $c->get(RecordEntry::class)(new EntryInput('2025-10-10', 'income', 'Subvención municipal', 'grants', 'transfer', '600'));
        $invoice = $c->get(RegisterInvoice::class)(new InvoiceInput('2025-10-01', 'R-10', 'Propietario del local', 'Alquiler octubre', 'rent', '950'), new UploadedDocument('alquiler.pdf', 'application/pdf', '%PDF-1.7'));
        $c->get(PayInvoice::class)($invoice, '2025-10-01', 'transfer');
        $c->get(EntityManagerInterface::class)->clear();

        $ledger = $c->get(MonthLedger::class)('2025-10');

        self::assertSame(60000, $ledger->incomeCents);
        self::assertSame(95000, $ledger->expenseCents);
        self::assertSame('Propietario del local · Alquiler octubre', $ledger->lines[1]->concept);

        $attachment = $c->get(DoctrineAccountingRepository::class)->invoice(SupplierInvoiceId::fromString($invoice))?->attachment();
        self::assertInstanceOf(\App\Domain\Accounting\Attachment::class, $attachment);
        self::assertSame('alquiler.pdf', $attachment->originalName);
        self::assertSame('%PDF-1.7', $c->get(LocalDocumentStorage::class)->read($attachment->key));
        $c->get(LocalDocumentStorage::class)->remove($attachment->key);
    }

    public function test_should_close_a_past_season_and_block_its_dates(): void
    {
        $c = self::getContainer();
        $c->get(RecordEntry::class)(new EntryInput('2024-11-10', 'expense', 'Comisión banco', 'other_expenses', 'card', '12,50'));

        $c->get(CloseSeason::class)(2024);

        self::assertTrue($c->get(SqlClosedPeriods::class)->isClosed(\App\Domain\Common\LocalDate::fromString('2025-08-31')));
        self::assertSame(-1250, $c->get(DoctrineAccountingRepository::class)->closing(new FiscalYear(2024))?->result()->cents);
        self::assertSame(-1250, $c->get(FiscalYearSummary::class)(2025)->openingCents);
        $this->expectException(PeriodClosed::class);
        $c->get(RecordEntry::class)(new EntryInput('2025-01-10', 'income', 'Tarde', 'other_income', 'cash', '5'));
    }
}

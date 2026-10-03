<?php

declare(strict_types=1);

namespace App\Tests\Support\Accounting;

use App\Application\Accounting\LedgerLine;
use App\Application\Accounting\Port\DocumentStorage;
use App\Application\Accounting\Port\LedgerQuery;
use App\Application\Accounting\Port\ManualEntryRepository;
use App\Application\Accounting\Port\SeasonClosingRepository;
use App\Application\Accounting\Port\SupplierInvoiceRepository;
use App\Application\Common\Port\ClosedPeriods;
use App\Domain\Accounting\FiscalYear;
use App\Domain\Accounting\ManualEntry;
use App\Domain\Accounting\ManualEntryId;
use App\Domain\Accounting\SeasonClosing;
use App\Domain\Accounting\SupplierInvoice;
use App\Domain\Accounting\SupplierInvoiceId;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;
use App\Tests\Support\FrozenClock;

/** Dobles en memoria de Accounting; el libro se compone de apuntes, facturas pagadas y líneas externas. */
final class AccountingFixture implements ManualEntryRepository, SupplierInvoiceRepository, SeasonClosingRepository, DocumentStorage, LedgerQuery, ClosedPeriods
{
    /** @var array<string, ManualEntry> */
    public array $entries = [];
    /** @var array<string, SupplierInvoice> */
    public array $invoices = [];
    /** @var array<int, SeasonClosing> */
    public array $closings = [];
    /** @var array<string, string> */
    public array $files = [];
    /** @var list<LedgerLine> líneas que vendrían de Cobros y Profesorado */
    public array $external = [];
    public FrozenClock $clock;

    public function __construct(string $now = '2027-09-05 10:00:00')
    {
        $this->clock = new FrozenClock($now);
    }

    public function entry(ManualEntryId $id): ?ManualEntry
    {
        return $this->entries[$id->value] ?? null;
    }

    public function saveEntry(ManualEntry $entry): void
    {
        $this->entries[$entry->id->value] = $entry;
    }

    public function deleteEntry(ManualEntryId $id): void
    {
        unset($this->entries[$id->value]);
    }

    public function invoice(SupplierInvoiceId $id): ?SupplierInvoice
    {
        return $this->invoices[$id->value] ?? null;
    }

    public function saveInvoice(SupplierInvoice $invoice): void
    {
        $this->invoices[$invoice->id()->value] = $invoice;
    }

    public function deleteInvoice(SupplierInvoiceId $id): void
    {
        unset($this->invoices[$id->value]);
    }

    public function closing(FiscalYear $year): ?SeasonClosing
    {
        return $this->closings[$year->startYear] ?? null;
    }

    public function closings(): array
    {
        return array_values($this->closings);
    }

    public function saveClosing(SeasonClosing $closing): void
    {
        $this->closings[$closing->year()->startYear] = $closing;
    }

    public function put(string $key, string $contents): void
    {
        $this->files[$key] = $contents;
    }

    public function read(string $key): string
    {
        return $this->files[$key];
    }

    public function remove(string $key): void
    {
        unset($this->files[$key]);
    }

    public function isClosed(LocalDate $date): bool
    {
        return null !== $this->closing(FiscalYear::of($date));
    }

    public function lines(YearMonth $month): array
    {
        $lines = array_filter($this->external, static fn (LedgerLine $l): bool => str_starts_with($l->date, $month->toString()));
        foreach ($this->entries as $e) {
            if (YearMonth::of($e->date)->equals($month)) {
                $lines[] = new LedgerLine('manual', $e->id->value, $e->date->toString(), $e->kind->value, $e->concept, $e->category->value, $e->method->value, $e->amount->cents);
            }
        }
        foreach ($this->invoices as $i) {
            if (null !== $i->paidOn() && YearMonth::of($i->paidOn())->equals($month)) {
                $lines[] = new LedgerLine('invoice', $i->id()->value, $i->paidOn()->toString(), 'expense', $i->supplier(), $i->category()->value, (string) $i->method()?->value, $i->amount()->cents);
            }
        }

        return array_values($lines);
    }
}

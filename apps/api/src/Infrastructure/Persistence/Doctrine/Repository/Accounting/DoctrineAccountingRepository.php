<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Accounting;

use App\Application\Accounting\Port\ManualEntryRepository;
use App\Application\Accounting\Port\SeasonClosingRepository;
use App\Application\Accounting\Port\SupplierInvoiceRepository;
use App\Domain\Accounting\Attachment;
use App\Domain\Accounting\EntryKind;
use App\Domain\Accounting\FiscalYear;
use App\Domain\Accounting\LedgerCategory;
use App\Domain\Accounting\ManualEntry;
use App\Domain\Accounting\ManualEntryId;
use App\Domain\Accounting\Method;
use App\Domain\Accounting\SeasonClosing;
use App\Domain\Accounting\SupplierInvoice;
use App\Domain\Accounting\SupplierInvoiceId;
use App\Domain\Common\Money;
use App\Infrastructure\Persistence\Doctrine\LocalDateMapping;
use App\Infrastructure\Persistence\Doctrine\Model\Accounting\ManualEntryRecord;
use App\Infrastructure\Persistence\Doctrine\Model\Accounting\SeasonClosingRecord;
use App\Infrastructure\Persistence\Doctrine\Model\Accounting\SupplierInvoiceRecord;
use Doctrine\ORM\EntityManagerInterface;

/** Repositorios de Accounting: apuntes manuales, facturas de proveedores y cierres. */
final readonly class DoctrineAccountingRepository implements ManualEntryRepository, SupplierInvoiceRepository, SeasonClosingRepository
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function entry(ManualEntryId $id): ?ManualEntry
    {
        $r = $this->em->find(ManualEntryRecord::class, $id->value);

        return null === $r ? null : ManualEntry::record(ManualEntryId::fromString($r->id), LocalDateMapping::fromColumn($r->entryDate), EntryKind::from($r->kind), $r->concept, LedgerCategory::from($r->category), Method::from($r->method), Money::cents($r->amountCents));
    }

    public function saveEntry(ManualEntry $entry): void
    {
        $this->em->persist(new ManualEntryRecord($entry->id->value, LocalDateMapping::toColumn($entry->date), $entry->kind->value, $entry->concept, $entry->category->value, $entry->method->value, $entry->amount->cents));
        $this->em->flush();
    }

    public function deleteEntry(ManualEntryId $id): void
    {
        $record = $this->em->find(ManualEntryRecord::class, $id->value);
        if (null !== $record) {
            $this->em->remove($record);
            $this->em->flush();
        }
    }

    public function invoice(SupplierInvoiceId $id): ?SupplierInvoice
    {
        $r = $this->em->find(SupplierInvoiceRecord::class, $id->value);
        if (null === $r) {
            return null;
        }
        $attachment = null === $r->attachmentKey ? null : new Attachment($r->attachmentKey, (string) $r->attachmentName, (string) $r->attachmentType, (int) $r->attachmentBytes);

        return SupplierInvoice::restore(
            SupplierInvoiceId::fromString($r->id),
            LocalDateMapping::fromColumn($r->invoiceDate),
            $r->number,
            $r->supplier,
            $r->concept,
            LedgerCategory::from($r->category),
            Money::cents($r->amountCents),
            null === $r->paidOn ? null : LocalDateMapping::fromColumn($r->paidOn),
            null === $r->method ? null : Method::from($r->method),
            $attachment,
        );
    }

    public function saveInvoice(SupplierInvoice $invoice): void
    {
        $record = $this->em->find(SupplierInvoiceRecord::class, $invoice->id()->value)
            ?? new SupplierInvoiceRecord($invoice->id()->value, LocalDateMapping::toColumn($invoice->date()), $invoice->number(), $invoice->supplier(), $invoice->concept(), $invoice->category()->value, $invoice->amount()->cents);
        $record->paidOn = null === $invoice->paidOn() ? null : LocalDateMapping::toColumn($invoice->paidOn());
        $record->method = $invoice->method()?->value;
        $record->attachmentKey = $invoice->attachment()?->key;
        $record->attachmentName = $invoice->attachment()?->originalName;
        $record->attachmentType = $invoice->attachment()?->mimeType;
        $record->attachmentBytes = $invoice->attachment()?->bytes;
        $this->em->persist($record);
        $this->em->flush();
    }

    public function deleteInvoice(SupplierInvoiceId $id): void
    {
        $record = $this->em->find(SupplierInvoiceRecord::class, $id->value);
        if (null !== $record) {
            $this->em->remove($record);
            $this->em->flush();
        }
    }

    public function closing(FiscalYear $year): ?SeasonClosing
    {
        $r = $this->em->find(SeasonClosingRecord::class, $year->startYear);

        return null === $r ? null : self::closingToDomain($r);
    }

    public function closings(): array
    {
        return array_values(array_map(self::closingToDomain(...), $this->em->getRepository(SeasonClosingRecord::class)->findBy([], ['startYear' => 'ASC'])));
    }

    public function saveClosing(SeasonClosing $closing): void
    {
        $this->em->persist(new SeasonClosingRecord($closing->year()->startYear, $closing->income()->cents, $closing->expenses()->cents, LocalDateMapping::toColumn($closing->closedOn())));
        $this->em->flush();
    }

    private static function closingToDomain(SeasonClosingRecord $r): SeasonClosing
    {
        return SeasonClosing::close(new FiscalYear($r->startYear), Money::cents($r->incomeCents), Money::cents($r->expenseCents), LocalDateMapping::fromColumn($r->closedOn));
    }
}

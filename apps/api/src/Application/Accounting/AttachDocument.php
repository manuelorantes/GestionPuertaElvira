<?php

declare(strict_types=1);

namespace App\Application\Accounting;

use App\Application\Accounting\Error\SupplierInvoiceNotFound;
use App\Application\Accounting\Port\DocumentStorage;
use App\Application\Accounting\Port\SupplierInvoiceRepository;
use App\Application\Common\Error\PeriodClosed;
use App\Application\Common\Port\ClosedPeriods;
use App\Domain\Accounting\SupplierInvoiceId;

/** Adjunta o sustituye el documento de una factura (el anterior se borra). */
final readonly class AttachDocument
{
    public function __construct(
        private SupplierInvoiceRepository $invoices,
        private DocumentStorage $storage,
        private ClosedPeriods $closed,
    ) {
    }

    public function __invoke(string $id, UploadedDocument $document): void
    {
        $invoice = $this->invoices->invoice(SupplierInvoiceId::fromString($id)) ?? throw new SupplierInvoiceNotFound();
        PeriodClosed::guard($this->closed, $invoice->date());
        $previous = $invoice->attach(Documents::store($this->storage, $invoice->id()->value, $document));
        $this->invoices->saveInvoice($invoice);
        if (null !== $previous) {
            $this->storage->remove($previous->key);
        }
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Accounting;

use App\Application\Accounting\Error\InvoiceAlreadyPaidCannotBeDeleted;
use App\Application\Accounting\Error\SupplierInvoiceNotFound;
use App\Application\Accounting\Port\DocumentStorage;
use App\Application\Accounting\Port\SupplierInvoiceRepository;
use App\Application\Common\Error\PeriodClosed;
use App\Application\Common\Port\ClosedPeriods;
use App\Domain\Accounting\SupplierInvoiceId;

final readonly class DeleteInvoice
{
    public function __construct(
        private SupplierInvoiceRepository $invoices,
        private DocumentStorage $storage,
        private ClosedPeriods $closed,
    ) {
    }

    public function __invoke(string $id): void
    {
        $invoice = $this->invoices->invoice(SupplierInvoiceId::fromString($id)) ?? throw new SupplierInvoiceNotFound();
        PeriodClosed::guard($this->closed, $invoice->date());
        if ($invoice->isPaid()) {
            throw new InvoiceAlreadyPaidCannotBeDeleted();
        }
        $this->invoices->deleteInvoice($invoice->id());
        if (null !== $invoice->attachment()) {
            $this->storage->remove($invoice->attachment()->key);
        }
    }
}

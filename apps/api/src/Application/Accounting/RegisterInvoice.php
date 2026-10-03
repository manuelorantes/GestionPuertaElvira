<?php

declare(strict_types=1);

namespace App\Application\Accounting;

use App\Application\Accounting\Port\DocumentStorage;
use App\Application\Accounting\Port\SupplierInvoiceRepository;
use App\Application\Common\Error\PeriodClosed;
use App\Application\Common\Port\ClosedPeriods;
use App\Domain\Accounting\LedgerCategory;
use App\Domain\Accounting\SupplierInvoice;
use App\Domain\Accounting\SupplierInvoiceId;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;

final readonly class RegisterInvoice
{
    public function __construct(
        private SupplierInvoiceRepository $invoices,
        private DocumentStorage $storage,
        private ClosedPeriods $closed,
    ) {
    }

    public function __invoke(InvoiceInput $input, ?UploadedDocument $document): string
    {
        $date = LocalDate::fromString($input->date);
        PeriodClosed::guard($this->closed, $date);
        $invoice = SupplierInvoice::register(SupplierInvoiceId::generate(), $date, $input->number, $input->supplier, $input->concept, LedgerCategory::fromName($input->category), Money::fromDecimal($input->amount));
        if (null !== $document) {
            $invoice->attach(Documents::store($this->storage, $invoice->id()->value, $document));
        }
        $this->invoices->saveInvoice($invoice);

        return $invoice->id()->value;
    }
}

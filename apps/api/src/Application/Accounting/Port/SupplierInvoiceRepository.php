<?php

declare(strict_types=1);

namespace App\Application\Accounting\Port;

use App\Domain\Accounting\SupplierInvoice;
use App\Domain\Accounting\SupplierInvoiceId;

interface SupplierInvoiceRepository
{
    public function invoice(SupplierInvoiceId $id): ?SupplierInvoice;

    public function saveInvoice(SupplierInvoice $invoice): void;

    public function deleteInvoice(SupplierInvoiceId $id): void;
}

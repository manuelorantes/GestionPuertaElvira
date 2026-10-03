<?php

declare(strict_types=1);

namespace App\Application\Accounting;

use App\Application\Accounting\Error\SupplierInvoiceNotFound;
use App\Application\Accounting\Port\SupplierInvoiceRepository;
use App\Application\Common\Error\PeriodClosed;
use App\Application\Common\Port\ClosedPeriods;
use App\Domain\Accounting\Method;
use App\Domain\Accounting\SupplierInvoiceId;
use App\Domain\Common\LocalDate;

final readonly class PayInvoice
{
    public function __construct(private SupplierInvoiceRepository $invoices, private ClosedPeriods $closed)
    {
    }

    public function __invoke(string $id, string $date, string $method): void
    {
        $invoice = $this->invoices->invoice(SupplierInvoiceId::fromString($id)) ?? throw new SupplierInvoiceNotFound();
        $paidOn = LocalDate::fromString($date);
        PeriodClosed::guard($this->closed, $paidOn);
        $invoice->pay($paidOn, Method::fromName($method));
        $this->invoices->saveInvoice($invoice);
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Application\Billing\Error\PaymentNotFound;
use App\Application\Billing\Port\DocumentSequence;
use App\Application\Billing\Port\PaymentRepository;
use App\Application\Common\Port\Locks;
use App\Application\Common\Port\TransactionRunner;
use App\Domain\Billing\BillingSettings;
use App\Domain\Billing\DocumentNumber;
use App\Domain\Billing\Error\InvoiceAlreadyIssued;
use App\Domain\Billing\InvoiceCustomer;
use App\Domain\Billing\PaymentId;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;

/** Emite, bajo petición, la factura de un cobro (una sola vez). */
final readonly class IssueInvoice
{
    public function __construct(
        private PaymentRepository $payments,
        private DocumentSequence $sequence,
        private TransactionRunner $transactions,
        private Clock $clock,
        private Locks $locks,
    ) {
    }

    public function __invoke(string $paymentId, string $name, string $taxId, string $address): void
    {
        $id = PaymentId::fromString($paymentId);
        $customer = new InvoiceCustomer(trim($name), strtoupper(trim($taxId)), trim($address));
        $today = LocalDate::fromInstant($this->clock->now());

        $this->transactions->run(function () use ($id, $customer, $today): void {
            // Dos peticiones a la vez no pueden gastar dos números de factura para el mismo cobro.
            $this->locks->acquire('billing:invoice:'.$id->value);
            $payment = $this->payments->payment($id) ?? throw new PaymentNotFound();
            if (null !== $payment->invoice()) {
                throw new InvoiceAlreadyIssued();
            }
            $season = Season::containing(YearMonth::of($today));
            $number = DocumentNumber::invoice($season->startYear, $this->sequence->next('F', $season->startYear));
            $payment->issueInvoice($number, $customer, BillingSettings::VAT_PERCENT, $today);
            $this->payments->savePayment($payment);
        });
    }
}

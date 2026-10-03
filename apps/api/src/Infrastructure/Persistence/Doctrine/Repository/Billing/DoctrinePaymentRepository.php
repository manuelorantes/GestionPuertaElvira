<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Billing;

use App\Application\Billing\Port\PaymentRepository;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\DocumentNumber;
use App\Domain\Billing\Invoice;
use App\Domain\Billing\InvoiceCustomer;
use App\Domain\Billing\Payment;
use App\Domain\Billing\PaymentId;
use App\Domain\Billing\PaymentMethod;
use App\Domain\Billing\QuoteLine;
use App\Domain\Billing\StudentRef;
use App\Domain\Billing\YearMonth;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use App\Infrastructure\Persistence\Doctrine\LocalDateMapping;
use App\Infrastructure\Persistence\Doctrine\Model\Billing\PaymentRecord;
use Doctrine\ORM\EntityManagerInterface;
use Webmozart\Assert\Assert;

final readonly class DoctrinePaymentRepository implements PaymentRepository
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function payment(PaymentId $id): ?Payment
    {
        $record = $this->em->find(PaymentRecord::class, $id->value);

        return null === $record ? null : self::toDomain($record);
    }

    public function savePayment(Payment $payment): void
    {
        $record = $this->em->find(PaymentRecord::class, $payment->id()->value) ?? new PaymentRecord(
            $payment->id()->value,
            $payment->student()->value,
            LocalDateMapping::toColumn($payment->paidOn()),
            $payment->method()->value,
            $payment->receipt()->toString(),
            $payment->kind()->value,
            $payment->concept(),
            array_map(static fn (QuoteLine $l): array => ['label' => $l->label, 'amountCents' => $l->amount->cents], $payment->lines()),
            $payment->total()->cents,
            array_map(static fn (YearMonth $p): string => $p->toString(), $payment->periods()),
            null,
            null,
        );
        $invoice = $payment->invoice();
        $record->invoiceNumber = $invoice?->number->toString();
        $record->invoice = null === $invoice ? null : self::invoiceData($invoice);
        $this->em->persist($record);
        $this->em->flush();
    }

    /** @return array<string, mixed> */
    public static function invoiceData(Invoice $i): array
    {
        return [
            'number' => $i->number->toString(),
            'issuedOn' => $i->issuedOn->toString(),
            'customerName' => $i->customer->name,
            'customerTaxId' => $i->customer->taxId,
            'customerAddress' => $i->customer->address,
            'vatPercent' => $i->vatPercent,
            'baseCents' => $i->base->cents,
            'vatCents' => $i->vat->cents,
            'totalCents' => $i->total->cents,
        ];
    }

    private static function toDomain(PaymentRecord $r): Payment
    {
        return Payment::restore(
            PaymentId::fromString($r->id),
            StudentRef::fromString($r->studentId),
            LocalDateMapping::fromColumn($r->paidOn),
            PaymentMethod::from($r->method),
            DocumentNumber::fromString($r->receiptNumber),
            ChargeKind::from($r->kind),
            $r->concept,
            array_map(static fn (array $l): QuoteLine => new QuoteLine($l['label'], Money::cents($l['amountCents'])), $r->lines),
            Money::cents($r->totalCents),
            array_map(YearMonth::fromString(...), $r->periods),
            null === $r->invoice ? null : self::invoice($r->invoice),
        );
    }

    /** @param array<string, mixed> $d */
    private static function invoice(array $d): Invoice
    {
        Assert::string($d['number']);
        Assert::string($d['issuedOn']);
        Assert::string($d['customerName']);
        Assert::string($d['customerTaxId']);
        Assert::string($d['customerAddress']);
        Assert::integer($d['vatPercent']);
        Assert::integer($d['baseCents']);
        Assert::integer($d['vatCents']);
        Assert::integer($d['totalCents']);

        return new Invoice(
            DocumentNumber::fromString($d['number']),
            LocalDate::fromString($d['issuedOn']),
            new InvoiceCustomer($d['customerName'], $d['customerTaxId'], $d['customerAddress']),
            $d['vatPercent'],
            Money::cents($d['baseCents']),
            Money::cents($d['vatCents']),
            Money::cents($d['totalCents']),
        );
    }
}

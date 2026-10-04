<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Application\Billing\Port\ChargeRepository;
use App\Application\Billing\Port\DocumentSequence;
use App\Application\Billing\Port\PaymentRepository;
use App\Application\Common\Error\PeriodClosed;
use App\Application\Common\Port\ClosedPeriods;
use App\Domain\Billing\Charge;
use App\Domain\Billing\ChargeId;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\DocumentNumber;
use App\Domain\Billing\Payment;
use App\Domain\Billing\PaymentId;
use App\Domain\Billing\PaymentMethod;
use App\Domain\Billing\QuoteLine;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;

/**
 * Cobro traído de la hoja de cálculo: un mes (o la cuota de socio) por el importe exacto que apuntó el club,
 * con su recibo. Si ese mes ya estaba cobrado en la aplicación, no se duplica. Se usa dentro de una transacción.
 */
final readonly class ImportPayment
{
    public function __construct(
        private ChargeRepository $charges,
        private PaymentRepository $payments,
        private DocumentSequence $sequence,
        private ClosedPeriods $closed,
    ) {
    }

    /** @return string|null id del cobro, o null si ese mes ya estaba cobrado */
    public function __invoke(string $studentId, ChargeKind $kind, YearMonth $period, Money $amount, LocalDate $paidOn): ?string
    {
        $student = \App\Domain\Billing\StudentRef::fromString($studentId);
        $charge = $this->charges->chargeFor($student, $kind, $period);
        if (true === $charge?->isPaid()) {
            return null;
        }
        PeriodClosed::guard($this->closed, $paidOn);

        $season = Season::containing($period);
        $concept = ChargeKind::Membership === $kind ? 'Cuota de socio '.$season->label() : ucfirst($period->label());
        $payment = Payment::register(
            PaymentId::generate(),
            $student,
            $paidOn,
            PaymentMethod::Transfer,
            DocumentNumber::receipt($season->startYear, $this->sequence->next('R', $season->startYear)),
            $kind,
            $concept,
            [new QuoteLine($concept.' (importado de la hoja)', $amount)],
            $amount,
            [$period],
        );
        $this->payments->savePayment($payment);

        $charge ??= Charge::create(ChargeId::generate(), $student, $kind, $period, $amount);
        $charge->payWith($payment->id());
        $this->charges->saveCharge($charge);

        return $payment->id()->value;
    }
}

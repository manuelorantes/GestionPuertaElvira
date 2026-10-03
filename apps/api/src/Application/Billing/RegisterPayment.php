<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Application\Billing\Port\ChargeRepository;
use App\Application\Billing\Port\DocumentSequence;
use App\Application\Billing\Port\PaymentRepository;
use App\Application\Common\Error\PeriodClosed;
use App\Application\Common\Port\ClosedPeriods;
use App\Application\Common\Port\TransactionRunner;
use App\Domain\Billing\Charge;
use App\Domain\Billing\ChargeId;
use App\Domain\Billing\DocumentNumber;
use App\Domain\Billing\Payment;
use App\Domain\Billing\PaymentId;
use App\Domain\Billing\PaymentMethod;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;

/** Registra el cobro con su recibo y deja pagadas las cuotas que cubre. */
final readonly class RegisterPayment
{
    public function __construct(
        private QuotePayment $quotes,
        private ChargeRepository $charges,
        private PaymentRepository $payments,
        private DocumentSequence $sequence,
        private TransactionRunner $transactions,
        private ClosedPeriods $closed,
    ) {
    }

    public function __invoke(PaymentRequest $request): string
    {
        $quote = ($this->quotes)($request);
        PeriodClosed::guard($this->closed, $quote->date);
        $ref = StudentRef::fromString($quote->student->id);

        return $this->transactions->run(function () use ($quote, $request, $ref): string {
            $season = Season::containing(YearMonth::of($quote->date));
            $payment = Payment::register(
                PaymentId::generate(),
                $ref,
                $quote->date,
                PaymentMethod::fromName($request->method),
                DocumentNumber::receipt($season->startYear, $this->sequence->next('R', $season->startYear)),
                $quote->kind,
                $quote->concept,
                $quote->quote->lines,
                $quote->quote->total,
                $quote->periods,
            );
            $this->payments->savePayment($payment);

            foreach ($quote->periods as $period) {
                $charge = $this->charges->chargeFor($ref, $quote->kind, $period)
                    ?? Charge::create(ChargeId::generate(), $ref, $quote->kind, $period, $quote->monthlyCharge);
                $charge->payWith($payment->id());
                $this->charges->saveCharge($charge);
            }

            return $payment->id()->value;
        });
    }
}

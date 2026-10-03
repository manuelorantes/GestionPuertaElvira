<?php

declare(strict_types=1);

namespace App\Tests\Application\Billing;

use App\Application\Billing\AdjustPoints;
use App\Application\Billing\GenerateMonthlyCharges;
use App\Application\Billing\IssueInvoice;
use App\Application\Billing\MarkReminded;
use App\Application\Billing\PaymentQuote;
use App\Application\Billing\PaymentRequest;
use App\Application\Billing\PrivateEnrolment;
use App\Application\Billing\QuotePayment;
use App\Application\Billing\RegisterPayment;
use App\Application\Billing\UpdateStudentAccount;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\Error\InvalidPaymentRequest;
use App\Domain\Billing\Error\InvoiceAlreadyIssued;
use App\Domain\Billing\PaymentId;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\YearMonth;
use App\Tests\Support\Billing\BillingFixture;
use PHPUnit\Framework\TestCase;

final class BillingUseCasesTest extends TestCase
{
    private BillingFixture $fx;

    protected function setUp(): void
    {
        $this->fx = new BillingFixture('2026-10-02 10:00:00');
    }

    public function test_should_generate_one_charge_per_active_student_and_month_idempotently(): void
    {
        $martina = $this->fx->student(regularHours: 2.0, siblings: true);
        $this->fx->student(regularHours: 0.0, private: [new PrivateEnrolment('Particular', 't1', 1.5)]);

        $this->generate('2026-10');
        $this->generate('2026-10');

        self::assertCount(2, $this->fx->charges);
        self::assertSame(4050, $this->fx->chargeFor(StudentRef::fromString($martina), ChargeKind::Monthly, YearMonth::fromString('2026-10'))?->amount()->cents);
    }

    public function test_should_charge_members_their_season_fee_once(): void
    {
        $id = $this->fx->student();
        new UpdateStudentAccount($this->fx)($id, 'monthly', true, null);

        $this->generate('2026-10');
        $this->generate('2026-11');

        self::assertSame(5000, $this->fx->chargeFor(StudentRef::fromString($id), ChargeKind::Membership, YearMonth::fromString('2026-09'))?->amount()->cents);
        self::assertCount(3, $this->fx->charges);
    }

    public function test_should_not_generate_charges_outside_the_teaching_season(): void
    {
        $this->fx->student();

        $this->generate('2027-07');

        self::assertSame([], $this->fx->charges);
    }

    public function test_should_use_the_agreed_private_rate_of_the_student(): void
    {
        $id = $this->fx->student(regularHours: 0.0, private: [new PrivateEnrolment('Particular', 't1', 1.5)]);
        new UpdateStudentAccount($this->fx)($id, 'monthly', false, '35');

        $quote = $this->quote($id, 1);

        self::assertSame(21000, $quote->quote->total->cents);
    }

    public function test_should_quote_without_saving_and_suggest_months_from_preference(): void
    {
        $id = $this->fx->student(regularHours: 3.0, siblings: true);
        new UpdateStudentAccount($this->fx)($id, 'three_months', false, null);

        $result = new QuotePayment($this->fx, $this->fx, $this->fx, $this->fx, $this->fx->clock)->suggestion($id);

        self::assertSame(3, $result);
        self::assertSame(9, new QuotePayment($this->fx, $this->fx, $this->fx, $this->fx, $this->fx->clock)->remainingMonths($id), 'de octubre a junio');
        self::assertSame(13200, $this->quote($id, 3)->quote->total->cents);
        self::assertSame([], $this->fx->payments);
    }

    public function test_should_pay_the_oldest_pending_charges_first_and_create_future_ones(): void
    {
        $id = $this->fx->student(regularHours: 2.0);
        $this->generate('2026-09');
        $this->generate('2026-10');

        $paymentId = $this->register($id, 3);

        $payment = $this->fx->payment(PaymentId::fromString($paymentId));
        self::assertSame(['2026-09', '2026-10', '2026-11'], array_map(static fn ($p): string => $p->toString(), $payment?->periods() ?? []));
        self::assertSame('R-2026-0001', $payment?->receipt()->toString());
        self::assertSame('Septiembre – noviembre 2026', $payment->concept());
        self::assertSame(12150, $payment->total()->cents);
        foreach (['2026-09', '2026-10', '2026-11'] as $month) {
            self::assertTrue($this->fx->chargeFor(StudentRef::fromString($id), ChargeKind::Monthly, YearMonth::fromString($month))?->isPaid());
        }
        self::assertSame(1, $this->fx->transactions->runs);
    }

    public function test_should_number_receipts_correlatively(): void
    {
        $id = $this->fx->student();

        $this->register($id, 1);
        $second = $this->register($id, 1);

        self::assertSame('R-2026-0002', $this->fx->payment(PaymentId::fromString($second))?->receipt()->toString());
    }

    public function test_should_not_go_beyond_june(): void
    {
        $id = $this->fx->student();

        $this->expectExceptionObject(InvalidPaymentRequest::beyondSeason(9));

        $this->register($id, 10);
    }

    public function test_should_register_the_membership_fee_without_discounts(): void
    {
        $id = $this->fx->student(siblings: true);
        new UpdateStudentAccount($this->fx)($id, 'monthly', true, null);
        $this->generate('2026-10');

        $paymentId = $this->register($id, 1, 'membership');

        $payment = $this->fx->payment(PaymentId::fromString($paymentId));
        self::assertSame(5000, $payment?->total()->cents);
        self::assertSame('Cuota de socio 2026/27', $payment->concept());
        self::assertTrue($this->fx->chargeFor(StudentRef::fromString($id), ChargeKind::Membership, YearMonth::fromString('2026-09'))?->isPaid());
    }

    public function test_should_issue_one_invoice_per_payment_with_its_own_numbering(): void
    {
        $id = $this->fx->student();
        $paymentId = $this->register($id, 1);
        $issue = new IssueInvoice($this->fx, $this->fx, $this->fx->transactions, $this->fx->clock);

        $issue($paymentId, 'Rocío Herrera', '12345678Z', 'Calle Elvira 1, Granada');

        self::assertSame('F-2026-0001', $this->fx->payment(PaymentId::fromString($paymentId))?->invoice()?->number->toString());
        $this->expectException(InvoiceAlreadyIssued::class);
        $issue($paymentId, 'Rocío Herrera', '12345678Z', 'Calle Elvira 1, Granada');
    }

    public function test_should_mark_reminders_and_adjust_points(): void
    {
        $id = $this->fx->student();
        $this->generate('2026-09');
        $charge = array_values($this->fx->charges)[0];

        new MarkReminded($this->fx, $this->fx->clock)($charge->id()->value);
        new AdjustPoints($this->fx)($id, 2);

        self::assertNotNull($charge->remindedOn());
        self::assertSame(2, $this->fx->account(StudentRef::fromString($id))?->points());
    }

    private function generate(string $month): void
    {
        new GenerateMonthlyCharges($this->fx, $this->fx, $this->fx, $this->fx)($month);
    }

    private function quote(string $id, int $months): PaymentQuote
    {
        return new QuotePayment($this->fx, $this->fx, $this->fx, $this->fx, $this->fx->clock)(new PaymentRequest($id, 'monthly', $months, 'cash', '2026-10-02', false, null, null));
    }

    private function register(string $id, int $months, string $kind = 'monthly'): string
    {
        $register = new RegisterPayment(new QuotePayment($this->fx, $this->fx, $this->fx, $this->fx, $this->fx->clock), $this->fx, $this->fx, $this->fx, $this->fx->transactions);

        return $register(new PaymentRequest($id, $kind, $months, 'transfer', '2026-10-02', false, null, null));
    }
}

<?php

declare(strict_types=1);

namespace App\Tests\Application\Billing;

use App\Application\Billing\GenerateMonthlyCharges;
use App\Application\Billing\ImportPayment;
use App\Application\Common\Error\PeriodClosed;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\PaymentId;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use App\Domain\Common\YearMonth;
use App\Tests\Support\Billing\BillingFixture;
use PHPUnit\Framework\TestCase;

final class ImportPaymentTest extends TestCase
{
    private BillingFixture $fx;

    protected function setUp(): void
    {
        $this->fx = new BillingFixture('2026-10-05 10:00:00');
    }

    public function test_should_record_the_exact_amount_of_the_sheet_with_a_receipt(): void
    {
        $id = $this->fx->student(regularHours: 2.0);

        $paymentId = $this->import($id, ChargeKind::Monthly, '2026-09', 2000, '2026-09-03');

        $payment = $this->fx->payment(PaymentId::fromString((string) $paymentId));
        self::assertNotNull($payment);
        self::assertSame(2000, $payment->total()->cents);
        self::assertSame('R-2026-0001', $payment->receipt()->toString());
        self::assertSame('Septiembre 2026', $payment->concept());
        $charge = $this->fx->chargeFor(StudentRef::fromString($id), ChargeKind::Monthly, YearMonth::fromString('2026-09'));
        self::assertNotNull($charge);
        self::assertSame(2000, $charge->amount()->cents);
        self::assertTrue($charge->isPaid());
    }

    public function test_should_pay_an_existing_pending_charge_and_skip_months_already_paid(): void
    {
        $id = $this->fx->student(regularHours: 2.0);
        new GenerateMonthlyCharges($this->fx, $this->fx, $this->fx, $this->fx, $this->fx->clock, $this->fx->transactions, $this->fx->locks)('2026-10');

        self::assertNotNull($this->import($id, ChargeKind::Monthly, '2026-10', 4500, '2026-10-03'));
        self::assertNull($this->import($id, ChargeKind::Monthly, '2026-10', 4500, '2026-10-04'));
        self::assertCount(1, $this->fx->payments);
    }

    public function test_should_record_the_membership_fee_and_respect_closed_seasons(): void
    {
        $id = $this->fx->student();

        $this->import($id, ChargeKind::Membership, '2026-09', 5000, '2026-09-03');
        self::assertSame('Cuota de socio 2026/27', array_values($this->fx->payments)[0]->concept());

        $this->fx->closedDates = ['2026-09-03'];
        $this->expectException(PeriodClosed::class);
        $this->import($id, ChargeKind::Monthly, '2026-09', 2000, '2026-09-03');
    }

    private function import(string $id, ChargeKind $kind, string $period, int $cents, string $date): ?string
    {
        return new ImportPayment($this->fx, $this->fx, $this->fx, $this->fx)($id, $kind, YearMonth::fromString($period), Money::cents($cents), LocalDate::fromString($date));
    }
}

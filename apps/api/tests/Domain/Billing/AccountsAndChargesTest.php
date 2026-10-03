<?php

declare(strict_types=1);

namespace App\Tests\Domain\Billing;

use App\Domain\Billing\Charge;
use App\Domain\Billing\ChargeId;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\ChargeStatus;
use App\Domain\Billing\Error\ChargeAlreadyPaid;
use App\Domain\Billing\PaymentId;
use App\Domain\Billing\PreferredPlan;
use App\Domain\Billing\StudentAccount;
use App\Domain\Billing\StudentRef;
use App\Domain\Billing\YearMonth;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class AccountsAndChargesTest extends TestCase
{
    public function test_should_open_a_monthly_account_and_update_its_preferences(): void
    {
        $account = StudentAccount::open(StudentRef::generate());

        self::assertSame(PreferredPlan::Monthly, $account->preferredPlan());
        self::assertFalse($account->isMember());

        $account->update(PreferredPlan::ThreeMonths, true, Money::euros(35));
        self::assertSame(3, $account->preferredPlan()->monthsWithin(10));
        self::assertTrue($account->isMember());
        self::assertSame(3500, $account->privateRate()?->cents);
        self::assertSame(4, PreferredPlan::RestOfSeason->monthsWithin(4));
    }

    public function test_should_add_points_but_never_go_below_zero(): void
    {
        $account = StudentAccount::open(StudentRef::generate());

        $account->adjustPoints(3);
        $account->adjustPoints(-1);
        self::assertSame(2, $account->points());

        $this->expectException(InvalidValue::class);
        $account->adjustPoints(-3);
    }

    #[DataProvider('statuses')]
    public function test_should_derive_the_status_of_a_monthly_charge_from_the_date(string $period, string $today, ChargeStatus $expected): void
    {
        $charge = Charge::create(ChargeId::generate(), StudentRef::generate(), ChargeKind::Monthly, YearMonth::fromString($period), Money::euros(45));

        self::assertSame($expected, $charge->statusOn(LocalDate::fromString($today)));
    }

    /** @return iterable<string, array{string, string, ChargeStatus}> */
    public static function statuses(): iterable
    {
        yield 'first day of the month' => ['2026-10', '2026-10-01', ChargeStatus::Due];
        yield 'last day in time' => ['2026-10', '2026-10-05', ChargeStatus::Due];
        yield 'sixth day' => ['2026-10', '2026-10-06', ChargeStatus::Overdue];
        yield 'previous month' => ['2026-09', '2026-10-02', ChargeStatus::Overdue];
        yield 'future month' => ['2026-11', '2026-10-20', ChargeStatus::Upcoming];
    }

    public function test_should_be_paid_once_and_remember_reminders(): void
    {
        $charge = Charge::create(ChargeId::generate(), StudentRef::generate(), ChargeKind::Monthly, YearMonth::fromString('2026-09'), Money::euros(45));
        $charge->markReminded(LocalDate::fromString('2026-10-02'));
        self::assertTrue($charge->remindedOn()?->equals(LocalDate::fromString('2026-10-02')));

        $payment = PaymentId::generate();
        $charge->payWith($payment);
        self::assertSame(ChargeStatus::Paid, $charge->statusOn(LocalDate::fromString('2026-10-02')));

        $this->expectException(ChargeAlreadyPaid::class);
        $charge->payWith(PaymentId::generate());
    }

    public function test_should_keep_membership_charges_due_until_paid(): void
    {
        $charge = Charge::create(ChargeId::generate(), StudentRef::generate(), ChargeKind::Membership, YearMonth::fromString('2026-09'), Money::euros(50));

        self::assertSame(ChargeStatus::Due, $charge->statusOn(LocalDate::fromString('2027-03-10')));
    }
}

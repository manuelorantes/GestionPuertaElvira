<?php

declare(strict_types=1);

namespace App\Tests\Domain\Billing;

use App\Domain\Billing\BillingSettings;
use App\Domain\Billing\Error\InvalidPaymentRequest;
use App\Domain\Billing\FeeCalculator;
use App\Domain\Billing\FeeProfile;
use App\Domain\Billing\PrivateLesson;
use App\Domain\Billing\Proration;
use App\Domain\Billing\Quote;
use App\Domain\Billing\SpecialDiscount;
use App\Domain\Common\Money;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class FeeCalculatorTest extends TestCase
{
    #[DataProvider('tiers')]
    public function test_should_charge_the_tier_for_the_weekly_hours_of_regular_groups(float $hours, int $expectedCents): void
    {
        $quote = $this->quote(new FeeProfile($hours, [], false), 1);

        self::assertSame($expectedCents, $quote->total->cents);
        self::assertSame($expectedCents, $quote->monthlyBase->cents);
    }

    /** @return iterable<string, array{float, int}> */
    public static function tiers(): iterable
    {
        yield 'no regular groups' => [0.0, 0];
        yield 'one hour' => [1.0, 3500];
        yield 'one and a half hours' => [1.5, 4000];
        yield 'two hours' => [2.0, 4500];
        yield 'two and a half hours' => [2.5, 4500];
        yield 'three hours' => [3.0, 5500];
        yield 'two groups summing four hours' => [4.0, 5500];
    }

    public function test_should_add_private_lessons_by_monthly_hours_and_rate(): void
    {
        $profile = new FeeProfile(0.0, [new PrivateLesson('Particular · viernes', 1.5, Money::euros(35))], false);

        $quote = $this->quote($profile, 1);

        self::assertSame(21000, $quote->total->cents, '1,5 h × 4 semanas × 35 €');
        self::assertSame('Particular · viernes · 6 h/mes × 35 €', $quote->lines[0]->label);
    }

    public function test_should_combine_the_tier_and_private_lessons(): void
    {
        $profile = new FeeProfile(2.0, [new PrivateLesson('Particular', 1.0, Money::euros(30))], false);

        self::assertSame(4500 + 12000, $this->quote($profile, 1)->total->cents);
    }

    public function test_should_add_up_discounts_for_siblings_and_prepayment(): void
    {
        $quote = $this->quote(new FeeProfile(3.0, [], true), 3);

        self::assertSame(16500, $quote->gross->cents);
        self::assertSame(20, $quote->discountPercent);
        self::assertSame(13200, $quote->total->cents);
        self::assertSame(['3 h semanales · 3 meses', 'Descuento familiar −10 %', 'Pago adelantado 3 meses −10 %'], array_map(static fn ($l): string => $l->label, $quote->lines));
    }

    #[DataProvider('prepayments')]
    public function test_should_pick_the_prepayment_discount_by_number_of_months(int $months, int $percent): void
    {
        self::assertSame($percent, $this->quote(new FeeProfile(1.0, [], false), $months)->discountPercent);
    }

    /** @return iterable<string, array{int, int}> */
    public static function prepayments(): iterable
    {
        yield 'one month' => [1, 0];
        yield 'two months' => [2, 0];
        yield 'three months' => [3, 10];
        yield 'five months' => [5, 10];
        yield 'six months' => [6, 15];
        yield 'rest of season (7+)' => [7, 20];
        yield 'whole season' => [10, 20];
    }

    public function test_should_add_a_special_discount_with_its_concept(): void
    {
        $quote = $this->quote(new FeeProfile(2.0, [], false), 1, new SpecialDiscount(5, 'Canje de 5 puntos'));

        self::assertSame(4275, $quote->total->cents);
        self::assertSame('Canje de 5 puntos −5 %', $quote->lines[1]->label);
    }

    public function test_should_prorate_the_first_month_by_remaining_days(): void
    {
        $quote = $this->quote(new FeeProfile(2.0, [], false), 1, null, new Proration(16, 31));

        self::assertSame(2323, $quote->gross->cents, '45 € × 16/31 días');
        self::assertSame('Prorrateo del 16 al 31 (16 de 31 días)', $quote->lines[1]->label);
        self::assertSame(-2177, $quote->lines[1]->amount->cents);
    }

    public function test_should_keep_lines_adding_up_exactly_to_the_total(): void
    {
        $quote = $this->quote(new FeeProfile(1.5, [new PrivateLesson('P', 1.5, Money::cents(3333))], true), 6, new SpecialDiscount(3, 'Especial'));

        $sum = array_reduce($quote->lines, static fn (Money $carry, $line): Money => $carry->plus($line->amount), Money::zero());
        self::assertTrue($sum->equals($quote->total));
    }

    public function test_should_reject_invalid_requests(): void
    {
        $this->expectExceptionObject(InvalidPaymentRequest::prorationRequiresOneMonth());

        $this->quote(new FeeProfile(1.0, [], false), 3, null, new Proration(10, 31));
    }

    public function test_should_reject_months_out_of_range(): void
    {
        $this->expectExceptionObject(InvalidPaymentRequest::months());

        $this->quote(new FeeProfile(1.0, [], false), 11);
    }

    private function quote(FeeProfile $profile, int $months, ?SpecialDiscount $special = null, ?Proration $proration = null): Quote
    {
        return new FeeCalculator()->quote($profile, BillingSettings::defaults(), $months, $special, $proration);
    }
}

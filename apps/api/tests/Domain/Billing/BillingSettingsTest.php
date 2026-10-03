<?php

declare(strict_types=1);

namespace App\Tests\Domain\Billing;

use App\Domain\Billing\BillingSettings;
use App\Domain\Billing\ClubFiscalData;
use App\Domain\Billing\Tariff;
use App\Domain\Billing\TeacherRef;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\Money;
use PHPUnit\Framework\TestCase;

final class BillingSettingsTest extends TestCase
{
    public function test_should_start_with_the_published_prices(): void
    {
        $settings = BillingSettings::defaults();

        self::assertSame(5500, $settings->tariff->threeHours->cents);
        self::assertSame(3500, $settings->tariff->oneHour->cents);
        self::assertSame(5000, $settings->tariff->membershipFee->cents);
        self::assertSame(10, $settings->tariff->familyPercent);
        self::assertSame(3000, $settings->privateRateFor('t1')->cents);
        self::assertSame(21, $settings->vatPercent);
    }

    public function test_should_use_the_teacher_private_rate_when_set(): void
    {
        $teacher = TeacherRef::generate()->value;
        $settings = BillingSettings::defaults()->withPrivateRates([$teacher => Money::euros(28)]);

        self::assertSame(2800, $settings->privateRateFor($teacher)->cents);
    }

    public function test_should_reject_negative_prices_and_percentages_out_of_range(): void
    {
        $this->expectException(InvalidValue::class);

        new Tariff(Money::euros(-1), Money::euros(45), Money::euros(40), Money::euros(35), Money::euros(50), 10, 10, 15, 20);
    }

    public function test_should_require_club_name_and_tax_id_for_invoices(): void
    {
        $this->expectException(InvalidValue::class);

        new ClubFiscalData('', 'G18000000', 'Granada');
    }
}

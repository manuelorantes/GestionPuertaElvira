<?php

declare(strict_types=1);

namespace App\Tests\Application\Billing;

use App\Application\Billing\SettingsInput;
use App\Application\Billing\UpdateBillingSettings;
use App\Domain\Common\InvalidValue;
use App\Tests\Support\Billing\BillingFixture;
use PHPUnit\Framework\TestCase;

final class UpdateBillingSettingsTest extends TestCase
{
    public function test_should_replace_prices_discounts_private_rates_and_fiscal_data(): void
    {
        $fx = new BillingFixture();

        new UpdateBillingSettings($fx)($this->input(['threeHours' => '60', 'familyPercent' => 12, 'privateRates' => ['0190a0a0-0000-7000-8000-000000000001' => '32,50']]));

        self::assertSame(6000, $fx->settings->tariff->threeHours->cents);
        self::assertSame(12, $fx->settings->tariff->familyPercent);
        self::assertSame(3250, $fx->settings->privateRateFor('0190a0a0-0000-7000-8000-000000000001')->cents);
        self::assertSame('G18999999', $fx->settings->club->taxId);
    }

    public function test_should_reject_invalid_values(): void
    {
        $this->expectException(InvalidValue::class);

        new UpdateBillingSettings(new BillingFixture())($this->input(['seasonPercent' => 120]));
    }

    /** @param array<string, mixed> $overrides */
    private function input(array $overrides): SettingsInput
    {
        $values = $overrides + [
            'threeHours' => '55', 'twoHours' => '45', 'hourAndHalf' => '40', 'oneHour' => '35', 'membershipFee' => '50',
            'familyPercent' => 10, 'threeMonthsPercent' => 10, 'sixMonthsPercent' => 15, 'seasonPercent' => 20,
            'defaultPrivateRate' => '30', 'privateRates' => [],
            'clubName' => 'Club Ajedrez Puerta Elvira', 'clubTaxId' => 'G18999999', 'clubAddress' => 'Granada',
        ];

        /** @phpstan-ignore argument.type (valores de prueba con tipos correctos) */
        return new SettingsInput(...$values);
    }
}

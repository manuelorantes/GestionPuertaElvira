<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Application\Billing\Port\BillingSettingsRepository;
use App\Domain\Billing\BillingSettings;
use App\Domain\Billing\ClubFiscalData;
use App\Domain\Billing\Tariff;
use App\Domain\Billing\TeacherRef;
use App\Domain\Common\Money;

final readonly class UpdateBillingSettings
{
    public function __construct(private BillingSettingsRepository $settings)
    {
    }

    public function __invoke(SettingsInput $input): void
    {
        $tariff = new Tariff(
            Money::fromDecimal($input->threeHours),
            Money::fromDecimal($input->twoHours),
            Money::fromDecimal($input->hourAndHalf),
            Money::fromDecimal($input->oneHour),
            Money::fromDecimal($input->membershipFee),
            $input->familyPercent,
            $input->threeMonthsPercent,
            $input->sixMonthsPercent,
            $input->seasonPercent,
        );
        $rates = [];
        foreach ($input->privateRates as $teacherId => $rate) {
            if ('' !== trim($rate)) {
                $rates[TeacherRef::fromString((string) $teacherId)->value] = Money::fromDecimal($rate);
            }
        }

        $this->settings->saveSettings(new BillingSettings(
            $tariff,
            Money::fromDecimal($input->defaultPrivateRate),
            $rates,
            new ClubFiscalData(trim($input->clubName), strtoupper(trim($input->clubTaxId)), trim($input->clubAddress)),
        ));
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Billing;

use App\Domain\Billing\BillingSettings;
use App\Domain\Billing\ClubFiscalData;
use App\Domain\Billing\Tariff;
use App\Domain\Common\Money;
use Webmozart\Assert\Assert;

final class BillingSettingsMapper
{
    /** @return array<string, mixed> */
    public static function toData(BillingSettings $s): array
    {
        $t = $s->tariff;

        return [
            'threeHours' => $t->threeHours->cents,
            'twoHours' => $t->twoHours->cents,
            'hourAndHalf' => $t->hourAndHalf->cents,
            'oneHour' => $t->oneHour->cents,
            'membershipFee' => $t->membershipFee->cents,
            'familyPercent' => $t->familyPercent,
            'threeMonthsPercent' => $t->threeMonthsPercent,
            'sixMonthsPercent' => $t->sixMonthsPercent,
            'seasonPercent' => $t->seasonPercent,
            'defaultPrivateRate' => $s->defaultPrivateRate->cents,
            'privateRates' => array_map(static fn (Money $m): int => $m->cents, $s->privateRates),
            'clubName' => $s->club->name,
            'clubTaxId' => $s->club->taxId,
            'clubAddress' => $s->club->address,
        ];
    }

    /** @param array<string, mixed> $d */
    public static function fromData(array $d): BillingSettings
    {
        $int = static function (string $key) use ($d): int {
            Assert::integer($d[$key] ?? null, "Ajuste {$key}: se esperaba un número");

            return $d[$key];
        };
        $string = static function (string $key) use ($d): string {
            Assert::string($d[$key] ?? null, "Ajuste {$key}: se esperaba texto");

            return $d[$key];
        };
        $rates = $d['privateRates'] ?? [];
        Assert::isArray($rates);
        Assert::allInteger($rates);

        return new BillingSettings(
            new Tariff(
                Money::cents($int('threeHours')),
                Money::cents($int('twoHours')),
                Money::cents($int('hourAndHalf')),
                Money::cents($int('oneHour')),
                Money::cents($int('membershipFee')),
                $int('familyPercent'),
                $int('threeMonthsPercent'),
                $int('sixMonthsPercent'),
                $int('seasonPercent'),
            ),
            Money::cents($int('defaultPrivateRate')),
            array_map(Money::cents(...), array_combine(array_map('strval', array_keys($rates)), $rates)),
            new ClubFiscalData($string('clubName'), $string('clubTaxId'), $string('clubAddress')),
        );
    }
}

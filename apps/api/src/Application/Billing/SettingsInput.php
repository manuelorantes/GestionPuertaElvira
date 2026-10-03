<?php

declare(strict_types=1);

namespace App\Application\Billing;

/** Ajustes tal como llegan del formulario: importes en texto decimal y descuentos en %. */
final readonly class SettingsInput
{
    /** @param array<string, string> $privateRates precio por hora por id de profesor */
    public function __construct(
        public string $threeHours,
        public string $twoHours,
        public string $hourAndHalf,
        public string $oneHour,
        public string $membershipFee,
        public int $familyPercent,
        public int $threeMonthsPercent,
        public int $sixMonthsPercent,
        public int $seasonPercent,
        public string $defaultPrivateRate,
        public array $privateRates,
        public string $clubName,
        public string $clubTaxId,
        public string $clubAddress,
    ) {
    }
}

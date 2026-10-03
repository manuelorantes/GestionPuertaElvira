<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Common\InvalidValue;
use App\Domain\Common\Money;

/**
 * Ajustes de facturación del club. Afectan a los cobros nuevos, nunca a los registrados.
 */
final readonly class BillingSettings
{
    public const int VAT_PERCENT = 21;

    /** @param array<string, Money> $privateRates precio por hora de las particulares por profesor */
    public function __construct(
        public Tariff $tariff,
        public Money $defaultPrivateRate,
        public array $privateRates,
        public ClubFiscalData $club,
        public int $vatPercent = self::VAT_PERCENT,
    ) {
        if ($defaultPrivateRate->isNegative() || [] !== array_filter($privateRates, static fn (Money $m): bool => $m->isNegative())) {
            throw new InvalidValue('privateRates', 'Los precios por hora no pueden ser negativos.');
        }
    }

    public static function defaults(): self
    {
        return new self(Tariff::defaults(), Money::euros(30), [], ClubFiscalData::defaults());
    }

    public function privateRateFor(string $teacherId): Money
    {
        return $this->privateRates[$teacherId] ?? $this->defaultPrivateRate;
    }

    /** @param array<string, Money> $rates */
    public function withPrivateRates(array $rates): self
    {
        return new self($this->tariff, $this->defaultPrivateRate, $rates, $this->club, $this->vatPercent);
    }
}

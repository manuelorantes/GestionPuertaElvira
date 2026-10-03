<?php

declare(strict_types=1);

namespace App\Application\Billing\Port;

use App\Domain\Billing\BillingSettings;

interface BillingSettingsRepository
{
    /** Ajustes guardados, o los de por defecto si nunca se han cambiado. */
    public function get(): BillingSettings;

    public function saveSettings(BillingSettings $settings): void;
}

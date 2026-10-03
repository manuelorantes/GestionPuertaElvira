<?php

declare(strict_types=1);

namespace App\Application\Billing;

final readonly class AccountView
{
    public function __construct(
        public string $preferredPlan,
        public bool $member,
        public ?string $privateRate,
        public int $points,
        public int $suggestedMonths,
    ) {
    }
}

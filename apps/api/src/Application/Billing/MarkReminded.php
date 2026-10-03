<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Application\Billing\Error\ChargeNotFound;
use App\Application\Billing\Port\ChargeRepository;
use App\Domain\Billing\ChargeId;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;

final readonly class MarkReminded
{
    public function __construct(private ChargeRepository $charges, private Clock $clock)
    {
    }

    public function __invoke(string $chargeId): void
    {
        $charge = $this->charges->charge(ChargeId::fromString($chargeId)) ?? throw new ChargeNotFound();
        $charge->markReminded(LocalDate::fromInstant($this->clock->now()));
        $this->charges->saveCharge($charge);
    }
}

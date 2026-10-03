<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Common\Money;

final readonly class PrivateLesson
{
    public const int WEEKS_PER_MONTH = 4;

    public function __construct(public string $groupName, public float $weeklyHours, public Money $hourlyRate)
    {
    }

    public function monthlyHours(): float
    {
        return $this->weeklyHours * self::WEEKS_PER_MONTH;
    }

    public function monthlyPrice(): Money
    {
        return $this->hourlyRate->times($this->monthlyHours());
    }
}

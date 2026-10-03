<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Common\Money;

final readonly class QuoteLine
{
    public function __construct(public string $label, public Money $amount)
    {
    }
}

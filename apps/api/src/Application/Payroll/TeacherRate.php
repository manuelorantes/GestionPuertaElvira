<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Domain\Common\Money;

final readonly class TeacherRate
{
    public function __construct(public string $id, public string $name, public Money $rate, public bool $active)
    {
    }
}

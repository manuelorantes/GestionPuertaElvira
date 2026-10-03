<?php

declare(strict_types=1);

namespace App\Application\Payroll;

final readonly class TeacherActivity
{
    /** @param list<string> $groups */
    public function __construct(public array $groups, public int $occupied, public int $capacity, public int $incomeCents)
    {
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Accounting;

enum EntryKind: string
{
    case Income = 'income';
    case Expense = 'expense';
}

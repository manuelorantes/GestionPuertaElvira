<?php

declare(strict_types=1);

namespace App\Application\Billing\Port;

use App\Domain\Billing\StudentAccount;
use App\Domain\Billing\StudentRef;

interface StudentAccountRepository
{
    public function account(StudentRef $student): ?StudentAccount;

    public function saveAccount(StudentAccount $account): void;
}

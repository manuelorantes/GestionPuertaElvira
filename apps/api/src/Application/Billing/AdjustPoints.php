<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Application\Billing\Port\StudentAccountRepository;
use App\Domain\Billing\StudentAccount;
use App\Domain\Billing\StudentRef;

final readonly class AdjustPoints
{
    public function __construct(private StudentAccountRepository $accounts)
    {
    }

    public function __invoke(string $studentId, int $delta): int
    {
        $ref = StudentRef::fromString($studentId);
        $account = $this->accounts->account($ref) ?? StudentAccount::open($ref);
        $account->adjustPoints($delta);
        $this->accounts->saveAccount($account);

        return $account->points();
    }
}

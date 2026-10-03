<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Application\Billing\Port\StudentAccountRepository;
use App\Domain\Billing\PreferredPlan;
use App\Domain\Billing\StudentAccount;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\Money;

final readonly class UpdateStudentAccount
{
    public function __construct(private StudentAccountRepository $accounts)
    {
    }

    public function __invoke(string $studentId, string $plan, bool $member, ?string $privateRate): void
    {
        $ref = StudentRef::fromString($studentId);
        $account = $this->accounts->account($ref) ?? StudentAccount::open($ref);
        $preferred = PreferredPlan::tryFrom($plan) ?? throw new InvalidValue('preferredPlan', 'Forma de pago preferida desconocida.');
        $rate = null === $privateRate || '' === trim($privateRate) ? null : Money::fromDecimal($privateRate);

        $account->update($preferred, $member, $rate);
        $this->accounts->saveAccount($account);
    }
}

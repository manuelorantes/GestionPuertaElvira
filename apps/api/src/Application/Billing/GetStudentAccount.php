<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Application\Billing\Error\BillingStudentNotFound;
use App\Application\Billing\Port\StudentAccountRepository;
use App\Application\Billing\Port\StudentDirectory;
use App\Domain\Billing\PreferredPlan;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;

final readonly class GetStudentAccount
{
    public function __construct(
        private StudentDirectory $directory,
        private StudentAccountRepository $accounts,
        private QuotePayment $quotes,
        private Clock $clock,
    ) {
    }

    public function __invoke(string $studentId): AccountView
    {
        $ref = StudentRef::fromString($studentId);
        if (null === $this->directory->find($ref, LocalDate::fromInstant($this->clock->now()))) {
            throw new BillingStudentNotFound();
        }
        $account = $this->accounts->account($ref);
        $rate = $account?->privateRate();

        return new AccountView(
            ($account?->preferredPlan() ?? PreferredPlan::Monthly)->value,
            true === $account?->isMember(),
            null === $rate ? null : number_format($rate->cents / 100, 2, '.', ''),
            $account?->points() ?? 0,
            $this->quotes->suggestion($studentId),
            $this->quotes->remainingMonths($studentId),
        );
    }
}

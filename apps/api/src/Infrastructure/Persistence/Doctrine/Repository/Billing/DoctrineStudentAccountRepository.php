<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Billing;

use App\Application\Billing\Port\StudentAccountRepository;
use App\Domain\Billing\PreferredPlan;
use App\Domain\Billing\StudentAccount;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\Money;
use App\Infrastructure\Persistence\Doctrine\Model\Billing\StudentAccountRecord;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineStudentAccountRepository implements StudentAccountRepository
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function account(StudentRef $student): ?StudentAccount
    {
        $r = $this->em->find(StudentAccountRecord::class, $student->value);

        return null === $r ? null : StudentAccount::restore(
            StudentRef::fromString($r->studentId),
            PreferredPlan::from($r->preferredPlan),
            $r->member,
            null === $r->privateRateCents ? null : Money::cents($r->privateRateCents),
            $r->points,
        );
    }

    public function saveAccount(StudentAccount $account): void
    {
        $record = $this->em->find(StudentAccountRecord::class, $account->student()->value)
            ?? new StudentAccountRecord($account->student()->value, '', false, null, 0);
        $record->preferredPlan = $account->preferredPlan()->value;
        $record->member = $account->isMember();
        $record->privateRateCents = $account->privateRate()?->cents;
        $record->points = $account->points();
        $this->em->persist($record);
        $this->em->flush();
    }
}

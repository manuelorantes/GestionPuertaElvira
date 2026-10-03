<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Billing;

use App\Application\Billing\Port\ChargeRepository;
use App\Domain\Billing\Charge;
use App\Domain\Billing\ChargeId;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\PaymentId;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\Money;
use App\Domain\Common\YearMonth;
use App\Infrastructure\Persistence\Doctrine\LocalDateMapping;
use App\Infrastructure\Persistence\Doctrine\Model\Billing\ChargeRecord;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineChargeRepository implements ChargeRepository
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function charge(ChargeId $id): ?Charge
    {
        $record = $this->em->find(ChargeRecord::class, $id->value);

        return null === $record ? null : self::toDomain($record);
    }

    public function chargeFor(StudentRef $student, ChargeKind $kind, YearMonth $period): ?Charge
    {
        $record = $this->em->getRepository(ChargeRecord::class)->findOneBy(['studentId' => $student->value, 'kind' => $kind->value, 'period' => $period->toString()]);

        return null === $record ? null : self::toDomain($record);
    }

    /** @return list<Charge> */
    public function unpaidFor(StudentRef $student, ChargeKind $kind): array
    {
        $records = $this->em->getRepository(ChargeRecord::class)->findBy(['studentId' => $student->value, 'kind' => $kind->value, 'paidBy' => null], ['period' => 'ASC']);

        return array_values(array_map(self::toDomain(...), $records));
    }

    public function latestMonthlyPeriod(StudentRef $student): ?YearMonth
    {
        $latest = $this->em->createQueryBuilder()
            ->select('MAX(c.period)')
            ->from(ChargeRecord::class, 'c')
            ->where('c.studentId = :student AND c.kind = :kind')
            ->setParameter('student', $student->value)
            ->setParameter('kind', ChargeKind::Monthly->value)
            ->getQuery()
            ->getSingleScalarResult();

        return \is_string($latest) ? YearMonth::fromString($latest) : null;
    }

    public function saveCharge(Charge $charge): void
    {
        $record = $this->em->find(ChargeRecord::class, $charge->id()->value)
            ?? new ChargeRecord($charge->id()->value, $charge->student()->value, $charge->kind()->value, $charge->period()->toString(), $charge->amount()->cents, null, null);
        $record->paidBy = $charge->paidBy()?->value;
        $record->remindedOn = null === $charge->remindedOn() ? null : LocalDateMapping::toColumn($charge->remindedOn());
        $this->em->persist($record);
        $this->em->flush();
    }

    private static function toDomain(ChargeRecord $r): Charge
    {
        return Charge::restore(
            ChargeId::fromString($r->id),
            StudentRef::fromString($r->studentId),
            ChargeKind::from($r->kind),
            YearMonth::fromString($r->period),
            Money::cents($r->amountCents),
            null === $r->paidBy ? null : PaymentId::fromString($r->paidBy),
            null === $r->remindedOn ? null : LocalDateMapping::fromColumn($r->remindedOn),
        );
    }
}

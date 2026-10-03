<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Payroll;

use App\Application\Payroll\Port\ProposalLog;
use App\Application\Payroll\Port\SettlementRepository;
use App\Domain\Common\Money;
use App\Domain\Common\YearMonth;
use App\Domain\Payroll\MonthlySettlement;
use App\Domain\Payroll\Settlement;
use App\Domain\Payroll\SettlementLine;
use App\Domain\Payroll\TeacherRef;
use App\Infrastructure\Persistence\Doctrine\LocalDateMapping;
use App\Infrastructure\Persistence\Doctrine\Model\Payroll\ProposedMonthRecord;
use App\Infrastructure\Persistence\Doctrine\Model\Payroll\SettlementRecord;
use Doctrine\ORM\EntityManagerInterface;

/** Liquidaciones pagadas y registro de meses propuestos. */
final readonly class DoctrineSettlementRepository implements SettlementRepository, ProposalLog
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function settlement(TeacherRef $teacher, YearMonth $month): ?MonthlySettlement
    {
        $record = $this->em->find(SettlementRecord::class, ['teacherId' => $teacher->value, 'month' => $month->toString()]);

        return null === $record ? null : self::toDomain($record);
    }

    public function settlementsOf(YearMonth $month): array
    {
        return array_values(array_map(self::toDomain(...), $this->em->getRepository(SettlementRecord::class)->findBy(['month' => $month->toString()])));
    }

    public function saveSettlement(MonthlySettlement $s): void
    {
        $this->em->persist(new SettlementRecord(
            $s->teacher->value,
            $s->month->toString(),
            $s->settlement->minutes,
            $s->settlement->rate->cents,
            $s->settlement->amount->cents,
            array_map(static fn (SettlementLine $l): array => ['label' => $l->label, 'minutes' => $l->minutes, 'amountCents' => $l->amount->cents], $s->settlement->lines),
            LocalDateMapping::toColumn($s->paidOn),
        ));
        $this->em->flush();
    }

    public function wasProposed(YearMonth $month): bool
    {
        return null !== $this->em->find(ProposedMonthRecord::class, $month->toString());
    }

    public function markProposed(YearMonth $month): void
    {
        $this->em->persist(new ProposedMonthRecord($month->toString()));
        $this->em->flush();
    }

    private static function toDomain(SettlementRecord $r): MonthlySettlement
    {
        return new MonthlySettlement(
            TeacherRef::fromString($r->teacherId),
            YearMonth::fromString($r->month),
            new Settlement($r->minutes, Money::cents($r->rateCents), Money::cents($r->amountCents), array_map(static fn (array $l): SettlementLine => new SettlementLine($l['label'], $l['minutes'], Money::cents($l['amountCents'])), $r->lines)),
            LocalDateMapping::fromColumn($r->paidOn),
        );
    }
}

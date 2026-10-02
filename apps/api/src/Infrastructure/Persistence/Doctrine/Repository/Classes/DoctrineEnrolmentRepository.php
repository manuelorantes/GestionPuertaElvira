<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Classes;

use App\Application\Classes\Port\EnrolmentRepository;
use App\Domain\Classes\ClassGroupId;
use App\Domain\Classes\Enrolment;
use App\Domain\Classes\EnrolmentId;
use App\Domain\Classes\StudentReference;
use App\Domain\Common\LocalDate;
use App\Infrastructure\Persistence\Doctrine\LocalDateMapping;
use App\Infrastructure\Persistence\Doctrine\Model\Classes\EnrolmentRecord;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\QueryBuilder;

final readonly class DoctrineEnrolmentRepository implements EnrolmentRepository
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function save(Enrolment $enrolment): void
    {
        $record = $this->em->find(EnrolmentRecord::class, $enrolment->id()->value)
            ?? new EnrolmentRecord($enrolment->id()->value, $enrolment->student()->value, $enrolment->group()->value, LocalDateMapping::toColumn($enrolment->enrolledOn()), null);
        $endsOn = $enrolment->endsOn();
        $record->endsOn = null === $endsOn ? null : LocalDateMapping::toColumn($endsOn);
        $this->em->persist($record);
        $this->em->flush();
    }

    public function activeForStudent(StudentReference $student, LocalDate $on): array
    {
        /** @var list<EnrolmentRecord> $records */
        $records = $this->activeOn($on)->andWhere('e.studentId = :student')->setParameter('student', $student->value)->getQuery()->getResult();

        return array_map(self::toDomain(...), $records);
    }

    public function activeForStudentInGroup(StudentReference $student, ClassGroupId $group, LocalDate $on): ?Enrolment
    {
        /** @var ?EnrolmentRecord $record */
        $record = $this->activeOn($on)
            ->andWhere('e.studentId = :student')->setParameter('student', $student->value)
            ->andWhere('e.classGroupId = :group')->setParameter('group', $group->value)
            ->getQuery()->getOneOrNullResult();

        return null === $record ? null : self::toDomain($record);
    }

    public function activeCount(ClassGroupId $group, LocalDate $on): int
    {
        return (int) $this->activeOn($on)->select('COUNT(e.id)')
            ->andWhere('e.classGroupId = :group')->setParameter('group', $group->value)
            ->getQuery()->getSingleScalarResult();
    }

    private function activeOn(LocalDate $on): QueryBuilder
    {
        return $this->em->createQueryBuilder()->select('e')->from(EnrolmentRecord::class, 'e')
            ->where('e.enrolledOn <= :on AND (e.endsOn IS NULL OR e.endsOn > :on)')
            ->setParameter('on', LocalDateMapping::toColumn($on), 'date_immutable');
    }

    private static function toDomain(EnrolmentRecord $record): Enrolment
    {
        return Enrolment::restore(
            EnrolmentId::fromString($record->id),
            StudentReference::fromString($record->studentId),
            ClassGroupId::fromString($record->classGroupId),
            LocalDateMapping::fromColumn($record->enrolledOn),
            null === $record->endsOn ? null : LocalDateMapping::fromColumn($record->endsOn),
        );
    }
}

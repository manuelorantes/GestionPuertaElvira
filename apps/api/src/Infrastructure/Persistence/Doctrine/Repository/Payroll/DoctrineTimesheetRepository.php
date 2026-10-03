<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Payroll;

use App\Application\Payroll\Port\TimesheetRepository;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;
use App\Domain\Payroll\GroupRef;
use App\Domain\Payroll\SessionMinutes;
use App\Domain\Payroll\TeacherRef;
use App\Domain\Payroll\TimesheetEntry;
use App\Domain\Payroll\TimesheetEntryId;
use App\Infrastructure\Persistence\Doctrine\LocalDateMapping;
use App\Infrastructure\Persistence\Doctrine\Model\Payroll\SessionRecord;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineTimesheetRepository implements TimesheetRepository
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function entry(TimesheetEntryId $id): ?TimesheetEntry
    {
        $record = $this->em->find(SessionRecord::class, $id->value);

        return null === $record ? null : self::toDomain($record);
    }

    public function save(TimesheetEntry $entry): void
    {
        $record = $this->em->find(SessionRecord::class, $entry->id()->value)
            ?? new SessionRecord($entry->id()->value, '', LocalDateMapping::toColumn($entry->date()), $entry->group()?->value, $entry->label(), 0, $entry->isFromSchedule());
        $record->teacherId = $entry->teacher()->value;
        $record->minutes = $entry->minutes()->minutes;
        $this->em->persist($record);
        $this->em->flush();
    }

    public function delete(TimesheetEntryId $id): void
    {
        $record = $this->em->find(SessionRecord::class, $id->value);
        if (null !== $record) {
            $this->em->remove($record);
            $this->em->flush();
        }
    }

    public function forMonth(YearMonth $month): array
    {
        $records = $this->em->createQueryBuilder()
            ->select('s')->from(SessionRecord::class, 's')
            ->where('s.sessionDate BETWEEN :from AND :to')
            ->setParameter('from', new DateTimeImmutable($month->toString().'-01'))
            ->setParameter('to', new DateTimeImmutable(\sprintf('%s-%02d', $month->toString(), $month->days())))
            ->orderBy('s.sessionDate')
            ->getQuery()->getResult();

        return self::map($records);
    }

    public function onDate(LocalDate $date): array
    {
        return self::map($this->em->getRepository(SessionRecord::class)->findBy(['sessionDate' => LocalDateMapping::toColumn($date)]));
    }

    /** @return list<TimesheetEntry> */
    private static function map(mixed $records): array
    {
        \assert(\is_array($records));

        return array_values(array_map(static function (mixed $r): TimesheetEntry {
            \assert($r instanceof SessionRecord);

            return self::toDomain($r);
        }, $records));
    }

    private static function toDomain(SessionRecord $r): TimesheetEntry
    {
        return TimesheetEntry::record(
            TimesheetEntryId::fromString($r->id),
            TeacherRef::fromString($r->teacherId),
            LocalDateMapping::fromColumn($r->sessionDate),
            null === $r->groupId ? null : GroupRef::fromString($r->groupId),
            $r->label,
            SessionMinutes::fromMinutes($r->minutes),
            $r->fromSchedule,
        );
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Classes;

use App\Application\Classes\GroupSummary;
use App\Application\Classes\Port\ClassQuery;
use App\Domain\Classes\Weekday;
use App\Domain\Common\LocalDate;
use App\Infrastructure\Persistence\Doctrine\Model\Classes\ClassGroupRecord;
use App\Infrastructure\Persistence\Doctrine\Repository\Classes\ClassGroupMapper;
use App\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;

/**
 * Lectura del horario: grupos con su profesor y su ocupación en una fecha.
 */
final readonly class SqlClassQuery implements ClassQuery
{
    private const string SQL = <<<'SQL'
        SELECT g.id, g.name, g.level, g.teacher_id, g.days, g.start_minutes, g.end_minutes, g.classroom, g.capacity,
               t.full_name AS teacher_name,
               (SELECT COUNT(*) FROM classes_enrolment e
                 WHERE e.class_group_id = g.id AND e.enrolled_on <= :on AND (e.ends_on IS NULL OR e.ends_on > :on)) AS occupied
          FROM classes_group g
          JOIN teachers_teacher t ON t.id = g.teacher_id
        SQL;

    public function __construct(private Connection $connection)
    {
    }

    public function groups(LocalDate $on): array
    {
        $rows = $this->connection->fetchAllAssociative(self::SQL.' ORDER BY g.classroom, g.start_minutes, g.name', ['on' => $on->toString()]);
        $groups = array_map(self::toSummary(...), $rows);
        $firstDay = static fn (GroupSummary $group): int => Weekday::fromName($group->days[0] ?? 'mon')->value;
        usort($groups, static fn (GroupSummary $a, GroupSummary $b): int => [$firstDay($a), $a->start, $a->classroom, $a->name] <=> [$firstDay($b), $b->start, $b->classroom, $b->name]);

        return $groups;
    }

    public function group(string $id, LocalDate $on): ?GroupSummary
    {
        $row = $this->connection->fetchAssociative(self::SQL.' WHERE g.id = :id', ['on' => $on->toString(), 'id' => $id]);

        return false === $row ? null : self::toSummary($row);
    }

    /** @return list<array{id: string, fullName: string, age: int}> alumnos con inscripción activa, por nombre */
    public function enrolledStudents(string $groupId, LocalDate $on): array
    {
        $rows = $this->connection->fetchAllAssociative(<<<'SQL'
            SELECT s.id, s.full_name, s.birth_date
              FROM classes_enrolment e
              JOIN students_student s ON s.id = e.student_id
             WHERE e.class_group_id = :group AND e.enrolled_on <= :on AND (e.ends_on IS NULL OR e.ends_on > :on)
             ORDER BY s.search_name
            SQL, ['group' => $groupId, 'on' => $on->toString()]);

        return array_map(static function (array $values) use ($on): array {
            $row = new Row($values);

            return ['id' => $row->string('id'), 'fullName' => $row->string('full_name'), 'age' => LocalDate::fromString($row->string('birth_date'))->ageOn($on)];
        }, $rows);
    }

    /** @param array<string, mixed> $values */
    private static function toSummary(array $values): GroupSummary
    {
        $row = new Row($values);
        $record = new ClassGroupRecord(
            $row->string('id'),
            $row->string('name'),
            $row->string('level'),
            $row->string('teacher_id'),
            $row->intListFromJson('days'),
            $row->int('start_minutes'),
            $row->int('end_minutes'),
            $row->int('classroom'),
            $row->int('capacity'),
        );
        $details = ClassGroupMapper::toDomain($record)->details();

        return new GroupSummary(
            $record->id,
            $details->name->value,
            $details->level->value,
            $record->teacherId,
            $row->string('teacher_name'),
            array_map(static fn (Weekday $day): string => $day->code(), $details->slot->days()),
            $details->slot->start->toString(),
            $details->slot->end->toString(),
            $details->slot->label(),
            $details->classroom->number,
            $details->capacity->value,
            $row->int('occupied'),
            $details->weeklyPlan()->value,
        );
    }
}

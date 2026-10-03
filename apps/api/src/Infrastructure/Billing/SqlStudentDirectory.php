<?php

declare(strict_types=1);

namespace App\Infrastructure\Billing;

use App\Application\Billing\BillingStudent;
use App\Application\Billing\Port\StudentDirectory;
use App\Application\Billing\PrivateEnrolment;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;
use App\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;

/**
 * Perfil de facturación a partir de Alumnado (tutor, hermanos) y Clases (horas semanales por tipo de grupo).
 */
final readonly class SqlStudentDirectory implements StudentDirectory
{
    private const string STUDENT_COLUMNS = <<<'SQL'
        s.id, s.full_name, s.guardians, s.own_phone,
        EXISTS (
            SELECT 1 FROM students_student sib
             WHERE sib.id::text IN (SELECT jsonb_array_elements_text(s.sibling_ids::jsonb))
               AND (sib.withdrawn_on IS NULL OR sib.withdrawn_on > :from)
        ) AS has_siblings
        SQL;

    public function __construct(private Connection $connection)
    {
    }

    public function activeIn(YearMonth $month): array
    {
        $range = self::range($month);
        $rows = $this->connection->fetchAllAssociative(
            'SELECT '.self::STUDENT_COLUMNS.' FROM students_student s
              WHERE s.joined_on <= :to AND (s.withdrawn_on IS NULL OR s.withdrawn_on > :from)
              ORDER BY s.search_name',
            $range,
        );

        return $this->build($rows, $range);
    }

    public function find(StudentRef $student, LocalDate $day): ?BillingStudent
    {
        $range = ['from' => $day->toString(), 'to' => $day->toString()];
        $rows = $this->connection->fetchAllAssociative('SELECT '.self::STUDENT_COLUMNS.' FROM students_student s WHERE s.id = :id', $range + ['id' => $student->value]);

        return $this->build($rows, $range)[0] ?? null;
    }

    /**
     * @param list<array<string, mixed>>      $rows
     * @param array{from: string, to: string} $range
     *
     * @return list<BillingStudent>
     */
    private function build(array $rows, array $range): array
    {
        if ([] === $rows) {
            return [];
        }
        $groups = $this->groupsByStudent(array_map(static fn (array $r): string => new Row($r)->string('id'), $rows), $range);

        return array_map(static function (array $values) use ($groups): BillingStudent {
            $row = new Row($values);
            $id = $row->string('id');
            $guardians = json_decode($row->string('guardians'), true, flags: \JSON_THROW_ON_ERROR);
            \assert(\is_array($guardians));
            $first = \is_array($guardians[0] ?? null) ? $guardians[0] : [];
            $regular = 0.0;
            $private = [];
            foreach ($groups[$id] ?? [] as $group) {
                if ('private_lesson' === $group['level']) {
                    $private[] = new PrivateEnrolment($group['name'], $group['teacherId'], $group['hours']);
                } else {
                    $regular += $group['hours'];
                }
            }

            return new BillingStudent(
                $id,
                $row->string('full_name'),
                \is_string($first['name'] ?? null) ? $first['name'] : $row->string('full_name'),
                \is_string($first['phone'] ?? null) ? $first['phone'] : ($row->nullableString('own_phone') ?? ''),
                $row->bool('has_siblings'),
                $regular,
                $private,
            );
        }, $rows);
    }

    /**
     * Grupos con inscripción vigente en algún día del rango.
     *
     * @param list<string>                    $studentIds
     * @param array{from: string, to: string} $range
     *
     * @return array<string, list<array{name: string, level: string, teacherId: string, hours: float}>>
     */
    private function groupsByStudent(array $studentIds, array $range): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT e.student_id, g.name, g.level, g.teacher_id, g.start_minutes, g.end_minutes, jsonb_array_length(g.days::jsonb) AS sessions
               FROM classes_enrolment e JOIN classes_group g ON g.id = e.class_group_id
              WHERE e.student_id IN (:ids) AND e.enrolled_on <= :to AND (e.ends_on IS NULL OR e.ends_on > :from)
              ORDER BY g.name',
            ['ids' => $studentIds] + $range,
            ['ids' => \Doctrine\DBAL\ArrayParameterType::STRING],
        );

        $groups = [];
        foreach ($rows as $values) {
            $row = new Row($values);
            $groups[$row->string('student_id')][] = [
                'name' => $row->string('name'),
                'level' => $row->string('level'),
                'teacherId' => $row->string('teacher_id'),
                'hours' => ($row->int('end_minutes') - $row->int('start_minutes')) / 60 * $row->int('sessions'),
            ];
        }

        return $groups;
    }

    /** @return array{from: string, to: string} */
    private static function range(YearMonth $month): array
    {
        return ['from' => $month->toString().'-01', 'to' => \sprintf('%s-%02d', $month->toString(), $month->days())];
    }
}

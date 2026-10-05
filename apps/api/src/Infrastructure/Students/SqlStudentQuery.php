<?php

declare(strict_types=1);

namespace App\Infrastructure\Students;

use App\Application\Students\Port\StudentQuery;
use App\Application\Students\StudentDetail;
use App\Application\Students\StudentFilter;
use App\Application\Students\StudentGroup;
use App\Application\Students\StudentSummary;
use App\Domain\Common\LocalDate;
use App\Infrastructure\Classes\SqlClassQuery;
use App\Infrastructure\Persistence\Doctrine\Row;
use App\Infrastructure\Persistence\Doctrine\SearchText;
use Doctrine\DBAL\Connection;

/**
 * Lecturas de Alumnado: lista con filtros y búsqueda sin tildes, y ficha con grupos y hermanos.
 */
final readonly class SqlStudentQuery implements StudentQuery
{
    public function __construct(private Connection $connection, private SqlClassQuery $classes)
    {
    }

    public function list(StudentFilter $filter, ?string $search, LocalDate $on): array
    {
        $conditions = match ($filter) {
            StudentFilter::All => '',
            StudentFilter::Active => 'AND (s.withdrawn_on IS NULL OR s.withdrawn_on > :on)',
            StudentFilter::Withdrawn => 'AND s.withdrawn_on IS NOT NULL AND s.withdrawn_on <= :on',
            StudentFilter::Siblings => "AND s.sibling_ids::jsonb <> '[]'::jsonb",
        };
        $params = ['on' => $on->toString()];
        if (null !== $search && '' !== trim($search)) {
            $conditions .= ' AND s.search_name LIKE :search';
            $params['search'] = '%'.SearchText::normalise($search).'%';
        }

        $rows = $this->connection->fetchAllAssociative("SELECT s.id, s.full_name, s.birth_date, s.withdrawn_on, s.sibling_ids FROM students_student s WHERE 1 = 1 {$conditions} ORDER BY s.search_name", $params);
        $groupsByStudent = $this->activeGroupsByStudent($on);

        return array_map(static function (array $values) use ($on, $groupsByStudent): StudentSummary {
            $row = new Row($values);
            $id = $row->string('id');

            return new StudentSummary(
                $id,
                $row->string('full_name'),
                LocalDate::fromString($row->string('birth_date'))->ageOn($on),
                self::status($row->nullableString('withdrawn_on'), $on),
                array_map(static fn (StudentGroup $g): array => ['id' => $g->id, 'name' => $g->name, 'slotLabel' => $g->slotLabel], $groupsByStudent[$id] ?? []),
                [] !== $row->stringListFromJson('sibling_ids'),
            );
        }, $rows);
    }

    public function total(): int
    {
        return new Row(['total' => $this->connection->fetchOne('SELECT COUNT(*) FROM students_student')])->int('total');
    }

    public function detail(string $id, LocalDate $on): ?StudentDetail
    {
        $values = $this->connection->fetchAssociative('SELECT * FROM students_student WHERE id = :id', ['id' => $id]);
        if (false === $values) {
            return null;
        }

        $row = new Row($values);
        $siblingIds = $row->stringListFromJson('sibling_ids');
        $siblings = [] === $siblingIds ? [] : $this->connection->fetchAllAssociative(
            'SELECT id, full_name FROM students_student WHERE id IN (:ids) ORDER BY search_name',
            ['ids' => $siblingIds],
            ['ids' => \Doctrine\DBAL\ArrayParameterType::STRING],
        );
        $guardians = json_decode($row->string('guardians'), true, flags: \JSON_THROW_ON_ERROR);
        \assert(\is_array($guardians));

        /** @var list<array{name: string, phone: string}> $guardians */
        return new StudentDetail(
            $id,
            $row->string('full_name'),
            $row->string('birth_date'),
            LocalDate::fromString($row->string('birth_date'))->ageOn($on),
            $row->nullableString('national_id'),
            $row->nullableString('contact_email'),
            $guardians,
            $row->nullableString('own_phone'),
            $row->nullableString('federation_licence'),
            $row->bool('image_consent'),
            $row->string('joined_on'),
            $row->nullableString('withdrawn_on'),
            self::status($row->nullableString('withdrawn_on'), $on),
            $this->activeGroupsByStudent($on, $id)[$id] ?? [],
            array_map(static function (array $values): array {
                $sibling = new Row($values);

                return ['id' => $sibling->string('id'), 'fullName' => $sibling->string('full_name')];
            }, $siblings),
        );
    }

    /** @return array<string, list<StudentGroup>> */
    private function activeGroupsByStudent(LocalDate $on, ?string $studentId = null): array
    {
        $groups = [];
        foreach ($this->classes->groups($on) as $group) {
            $groups[$group->id] = $group;
        }

        $sql = 'SELECT student_id, class_group_id FROM classes_enrolment WHERE enrolled_on <= :on AND (ends_on IS NULL OR ends_on > :on)';
        $params = ['on' => $on->toString()];
        if (null !== $studentId) {
            $sql .= ' AND student_id = :student';
            $params['student'] = $studentId;
        }
        // Orden estable: primero el grupo en el que se inscribió antes (el id es UUIDv7, ordenado por tiempo).
        $sql .= ' ORDER BY enrolled_on, id';

        $byStudent = [];
        foreach ($this->connection->fetchAllAssociative($sql, $params) as $values) {
            $row = new Row($values);
            $group = $groups[$row->string('class_group_id')] ?? null;
            if (null !== $group) {
                $byStudent[$row->string('student_id')][] = new StudentGroup($group->id, $group->name, $group->slotLabel, $group->teacherName, $group->classroom);
            }
        }

        return $byStudent;
    }

    private static function status(?string $withdrawnOn, LocalDate $on): string
    {
        return null !== $withdrawnOn && !$on->isBefore(LocalDate::fromString($withdrawnOn)) ? 'withdrawn' : 'active';
    }
}

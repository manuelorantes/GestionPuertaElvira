<?php

declare(strict_types=1);

namespace App\Infrastructure\Teachers;

use App\Application\Teachers\Port\TeacherQuery;
use App\Application\Teachers\TeacherSummary;
use App\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;

final readonly class SqlTeacherQuery implements TeacherQuery
{
    public function __construct(private Connection $connection)
    {
    }

    public function all(): array
    {
        $rows = $this->connection->fetchAllAssociative(<<<'SQL'
            SELECT t.id, t.full_name, t.active, t.hourly_rate_cents, (SELECT COUNT(*) FROM classes_group g WHERE g.teacher_id = t.id) AS group_count
              FROM teachers_teacher t
             ORDER BY t.full_name
            SQL);

        return array_map(static function (array $values): TeacherSummary {
            $row = new Row($values);

            return new TeacherSummary($row->string('id'), $row->string('full_name'), $row->bool('active'), $row->int('group_count'), number_format($row->int('hourly_rate_cents') / 100, 2, '.', ''));
        }, $rows);
    }
}

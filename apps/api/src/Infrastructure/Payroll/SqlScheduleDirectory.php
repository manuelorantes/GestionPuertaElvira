<?php

declare(strict_types=1);

namespace App\Infrastructure\Payroll;

use App\Application\Payroll\Port\ScheduleDirectory;
use App\Domain\Payroll\GroupRef;
use App\Domain\Payroll\ScheduledGroup;
use App\Domain\Payroll\TeacherRef;
use App\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;

/** Horario de Clases visto desde Payroll. */
final readonly class SqlScheduleDirectory implements ScheduleDirectory
{
    public function __construct(private Connection $connection)
    {
    }

    public function groups(): array
    {
        $rows = $this->connection->fetchAllAssociative('SELECT id, name, teacher_id, days, start_minutes, end_minutes FROM classes_group ORDER BY name');

        return array_map(static function (array $values): ScheduledGroup {
            $row = new Row($values);

            return new ScheduledGroup(
                GroupRef::fromString($row->string('id')),
                $row->string('name'),
                TeacherRef::fromString($row->string('teacher_id')),
                $row->intListFromJson('days'),
                $row->int('end_minutes') - $row->int('start_minutes'),
            );
        }, $rows);
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Payroll;

use App\Application\Payroll\Port\TeacherRates;
use App\Application\Payroll\TeacherRate;
use App\Domain\Common\Money;
use App\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;

/** Tarifas de Teachers vistas desde Payroll. */
final readonly class SqlTeacherRates implements TeacherRates
{
    public function __construct(private Connection $connection)
    {
    }

    public function all(): array
    {
        $rows = $this->connection->fetchAllAssociative('SELECT id, full_name, hourly_rate_cents, active FROM teachers_teacher ORDER BY full_name');

        return array_map(static function (array $values): TeacherRate {
            $row = new Row($values);

            return new TeacherRate($row->string('id'), $row->string('full_name'), Money::cents($row->int('hourly_rate_cents')), $row->bool('active'));
        }, $rows);
    }
}

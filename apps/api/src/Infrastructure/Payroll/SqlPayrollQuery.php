<?php

declare(strict_types=1);

namespace App\Infrastructure\Payroll;

use App\Application\Payroll\Port\PayrollQuery;
use App\Application\Payroll\SessionView;
use App\Application\Payroll\TeacherActivity;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;
use App\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;

final readonly class SqlPayrollQuery implements PayrollQuery
{
    public function __construct(private Connection $connection, private Clock $clock)
    {
    }

    public function sessions(YearMonth $month, ?string $teacherId): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT s.*, t.full_name, COALESCE(st.rate_cents, t.hourly_rate_cents) AS rate_cents, st.teacher_id IS NOT NULL AS locked
               FROM payroll_session s
               JOIN teachers_teacher t ON t.id = s.teacher_id
               LEFT JOIN payroll_settlement st ON st.teacher_id = s.teacher_id AND st.month = :month
              WHERE s.session_date BETWEEN :from AND :to AND (:teacher::uuid IS NULL OR s.teacher_id = :teacher::uuid)
              ORDER BY s.session_date, s.label',
            self::range($month) + ['month' => $month->toString(), 'teacher' => $teacherId],
        );

        return array_map(static function (array $values): SessionView {
            $row = new Row($values);

            return new SessionView(
                $row->string('id'),
                $row->string('session_date'),
                $row->string('teacher_id'),
                $row->string('full_name'),
                $row->nullableString('group_id'),
                $row->string('label'),
                $row->int('minutes'),
                (int) round($row->int('rate_cents') * $row->int('minutes') / 60),
                $row->bool('from_schedule'),
                $row->bool('locked'),
            );
        }, $rows);
    }

    public function activity(YearMonth $month): array
    {
        $range = self::range($month);
        $today = LocalDate::fromInstant($this->clock->now())->toString();

        // Grupos y ocupación actual por profesor.
        $groups = $this->connection->fetchAllAssociative(
            'SELECT g.teacher_id, g.name, g.capacity,
                    (SELECT COUNT(*) FROM classes_enrolment e WHERE e.class_group_id = g.id AND e.enrolled_on <= :today AND (e.ends_on IS NULL OR e.ends_on > :today)) AS occupied
               FROM classes_group g ORDER BY g.name',
            ['today' => $today],
        );
        $activity = [];
        foreach ($groups as $values) {
            $row = new Row($values);
            $teacher = $row->string('teacher_id');
            $current = $activity[$teacher] ?? ['groups' => [], 'occupied' => 0, 'capacity' => 0, 'income' => 0.0];
            $current['groups'][] = $row->string('name');
            $current['occupied'] += $row->int('occupied');
            $current['capacity'] += $row->int('capacity');
            $activity[$teacher] = $current;
        }

        // Horas semanales de cada alumno por profesor durante el mes, para repartir su cuota.
        $hours = $this->connection->fetchAllAssociative(
            'SELECT e.student_id, g.teacher_id, SUM((g.end_minutes - g.start_minutes) * jsonb_array_length(g.days::jsonb)) AS minutes
               FROM classes_enrolment e JOIN classes_group g ON g.id = e.class_group_id
              WHERE e.enrolled_on <= :to AND (e.ends_on IS NULL OR e.ends_on > :from)
              GROUP BY e.student_id, g.teacher_id',
            $range,
        );
        $byStudent = [];
        foreach ($hours as $values) {
            $row = new Row($values);
            $byStudent[$row->string('student_id')][$row->string('teacher_id')] = $row->int('minutes');
        }

        $charges = $this->connection->fetchAllAssociative(
            // Lo realmente cobrado por ese mes: el total del cobro repartido entre los meses que cubre (con sus descuentos).
            "SELECT c.student_id, ROUND(p.total_cents::numeric / GREATEST(jsonb_array_length(p.periods::jsonb), 1)) AS amount_cents
               FROM billing_charge c JOIN billing_payment p ON p.id = c.paid_by
              WHERE c.kind = 'monthly' AND c.period = :month",
            ['month' => $month->toString()],
        );
        foreach ($charges as $values) {
            $row = new Row($values);
            $shares = $byStudent[$row->string('student_id')] ?? [];
            $total = array_sum($shares);
            foreach ($shares as $teacher => $minutes) {
                if ($total > 0 && isset($activity[$teacher])) {
                    $activity[$teacher]['income'] += $row->int('amount_cents') * $minutes / $total;
                }
            }
        }

        return array_map(
            static fn (array $a): TeacherActivity => new TeacherActivity($a['groups'], $a['occupied'], $a['capacity'], (int) round($a['income'])),
            $activity,
        );
    }

    /** @return array{from: string, to: string} */
    private static function range(YearMonth $month): array
    {
        return ['from' => $month->toString().'-01', 'to' => \sprintf('%s-%02d', $month->toString(), $month->days())];
    }
}

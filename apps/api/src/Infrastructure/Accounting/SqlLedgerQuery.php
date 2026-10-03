<?php

declare(strict_types=1);

namespace App\Infrastructure\Accounting;

use App\Application\Accounting\LedgerLine;
use App\Application\Accounting\Port\LedgerQuery;
use App\Domain\Common\YearMonth;
use App\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;

/** El libro se compone en lectura a partir de Cobros, Profesorado, facturas pagadas y apuntes manuales. */
final readonly class SqlLedgerQuery implements LedgerQuery
{
    public function __construct(private Connection $connection)
    {
    }

    public function lines(YearMonth $month): array
    {
        $rows = $this->connection->fetchAllAssociative(<<<'SQL'
            SELECT 'payment' AS source, p.id::text AS source_id, p.paid_on AS date, 'income' AS kind,
                   p.concept || ' · ' || s.full_name AS concept,
                   CASE p.kind WHEN 'membership' THEN 'membership' ELSE 'fees' END AS category, p.method, p.total_cents AS amount
              FROM billing_payment p JOIN students_student s ON s.id = p.student_id
             WHERE p.paid_on BETWEEN :from AND :to
            UNION ALL
            SELECT 'settlement', st.teacher_id::text || '/' || st.month, st.paid_on, 'expense',
                   'Liquidación ' || st.month || ' · ' || t.full_name, 'teachers', 'transfer', st.amount_cents
              FROM payroll_settlement st JOIN teachers_teacher t ON t.id = st.teacher_id
             WHERE st.paid_on BETWEEN :from AND :to
            UNION ALL
            SELECT 'invoice', i.id::text, i.paid_on, 'expense', i.supplier || ' · ' || i.concept, i.category, i.method, i.amount_cents
              FROM accounting_invoice i
             WHERE i.paid_on BETWEEN :from AND :to
            UNION ALL
            SELECT 'manual', e.id::text, e.entry_date, e.kind, e.concept, e.category, e.method, e.amount_cents
              FROM accounting_entry e
             WHERE e.entry_date BETWEEN :from AND :to
            SQL, ['from' => $month->toString().'-01', 'to' => \sprintf('%s-%02d', $month->toString(), $month->days())]);

        return array_map(static function (array $values): LedgerLine {
            $row = new Row($values);

            return new LedgerLine($row->string('source'), $row->string('source_id'), $row->string('date'), $row->string('kind'), $row->string('concept'), $row->string('category'), $row->string('method'), $row->int('amount'));
        }, $rows);
    }
}

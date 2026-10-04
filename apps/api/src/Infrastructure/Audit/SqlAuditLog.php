<?php

declare(strict_types=1);

namespace App\Infrastructure\Audit;

use App\Application\Audit\AuditActionId;
use App\Application\Audit\AuditActionView;
use App\Application\Audit\AuditChangeView;
use App\Application\Audit\AuditFilter;
use App\Application\Audit\Port\AuditLog;
use App\Application\Audit\Port\AuditReverter;
use App\Infrastructure\Persistence\Doctrine\Row;
use DateTimeImmutable;
use DateTimeZone;
use Doctrine\DBAL\Connection;

/**
 * Lectura y reversión del historial (tablas audit_action y audit_change, rellenadas por el trigger audit_capture).
 * Las cuentas de usuario se registran pero no se revierten.
 */
final readonly class SqlAuditLog implements AuditLog, AuditReverter
{
    private const string NOT_REVERTIBLE = 'identity_user';

    /** Campos que nunca se muestran. */
    private const string SECRET = '/password|token|hash/i';

    private const string ACTION_COLUMNS = <<<'SQL'
        a.id, a.seq, a.kind, a.user_id, a.user_name, a.label, a.occurred_at, a.reverts,
        (SELECT COUNT(*) FROM audit_change c WHERE c.action_id = a.id) AS change_count,
        (SELECT COUNT(*) FROM audit_change c WHERE c.action_id = a.id AND c.table_name <> 'identity_user') AS revertible,
        (SELECT COALESCE(json_agg(DISTINCT c.table_name), '[]') FROM audit_change c WHERE c.action_id = a.id) AS tables
        SQL;

    public function __construct(private Connection $connection)
    {
    }

    public function actions(AuditFilter $filter): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT '.self::ACTION_COLUMNS.' FROM audit_action a
              WHERE (:user::uuid IS NULL OR a.user_id = :user::uuid) AND (:before::bigint IS NULL OR a.seq < :before::bigint)
              ORDER BY a.seq DESC LIMIT :limit',
            ['user' => $filter->userId, 'before' => $filter->beforeSeq, 'limit' => max(1, min(200, $filter->limit))],
        );

        return array_map(self::view(...), $rows);
    }

    public function action(string $id): ?AuditActionView
    {
        $row = $this->connection->fetchAssociative('SELECT '.self::ACTION_COLUMNS.' FROM audit_action a WHERE a.id = :id::uuid', ['id' => $id]);

        return false === $row ? null : self::view($row);
    }

    public function changes(string $actionId): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT table_name, row_key, operation, before, after FROM audit_change WHERE action_id = :id::uuid ORDER BY id',
            ['id' => $actionId],
        );

        return array_map(static function (array $values): AuditChangeView {
            $row = new Row($values);
            $before = self::json($row->nullableString('before'));
            $after = self::json($row->nullableString('after'));
            $fields = [];
            foreach (array_unique([...array_keys($before), ...array_keys($after)]) as $field) {
                if (1 === preg_match(self::SECRET, (string) $field)) {
                    continue;
                }
                $old = $before[$field] ?? null;
                $new = $after[$field] ?? null;
                if ('U' !== $row->string('operation') || $old !== $new) {
                    $fields[] = ['field' => (string) $field, 'before' => $old, 'after' => $new];
                }
            }

            return new AuditChangeView(
                $row->string('table_name'),
                AuditLabels::table($row->string('table_name')),
                self::json($row->string('row_key')),
                $row->string('operation'),
                $fields,
            );
        }, $rows);
    }

    public function people(): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT DISTINCT ON (user_id) user_id, user_name FROM audit_action WHERE user_id IS NOT NULL ORDER BY user_id, seq DESC',
        );

        return array_map(static fn (array $v): array => ['id' => new Row($v)->string('user_id'), 'name' => new Row($v)->string('user_name')], $rows);
    }

    public function begin(string $label, string $kind, string $reverts): void
    {
        $id = AuditActionId::generate()->value;
        $this->connection->executeStatement(
            "INSERT INTO audit_action (id, kind, user_id, user_name, label, reverts)
             VALUES (:id, :kind, NULLIF(current_setting('audit.user_id', true), '')::uuid,
                     COALESCE(NULLIF(current_setting('audit.user_name', true), ''), 'Sistema'), :label, :reverts)",
            ['id' => $id, 'kind' => $kind, 'label' => mb_substr($label, 0, 160), 'reverts' => $reverts],
        );
        $this->connection->executeQuery("SELECT set_config('audit.action_id', :id, true)", ['id' => $id]);
    }

    public function changesOf(string $actionId): array
    {
        return $this->ids(
            'SELECT id FROM audit_change WHERE action_id = :id::uuid AND table_name <> :skip ORDER BY id DESC',
            ['id' => $actionId, 'skip' => self::NOT_REVERTIBLE],
        );
    }

    public function changesAfter(string $actionId): array
    {
        return $this->ids(
            'SELECT c.id FROM audit_change c
              WHERE c.table_name <> :skip
                AND c.action_id IN (SELECT later.id FROM audit_action later WHERE later.seq > (SELECT seq FROM audit_action WHERE id = :id::uuid))
              ORDER BY c.id DESC',
            ['id' => $actionId, 'skip' => self::NOT_REVERTIBLE],
        );
    }

    public function laterActionsTouchingTheSameRecords(string $actionId): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT '.self::ACTION_COLUMNS.' FROM audit_action a
              WHERE a.seq > (SELECT seq FROM audit_action WHERE id = :id::uuid)
                AND EXISTS (
                    SELECT 1 FROM audit_change later JOIN audit_change mine
                      ON mine.table_name = later.table_name AND mine.row_key = later.row_key
                     WHERE later.action_id = a.id AND mine.action_id = :id::uuid AND later.table_name <> :skip
                )
              ORDER BY a.seq',
            ['id' => $actionId, 'skip' => self::NOT_REVERTIBLE],
        );

        return array_map(self::view(...), $rows);
    }

    public function revert(int $changeId): void
    {
        $this->connection->executeQuery('SELECT audit_revert_change(:id)', ['id' => $changeId]);
    }

    /**
     * @param array<string, mixed> $params
     *
     * @return list<int>
     */
    private function ids(string $sql, array $params): array
    {
        return array_map(static fn (mixed $id): int => (int) (is_numeric($id) ? $id : 0), $this->connection->fetchFirstColumn($sql, $params));
    }

    /** @param array<string, mixed> $values */
    private static function view(array $values): AuditActionView
    {
        $row = new Row($values);
        $tables = json_decode($row->string('tables'), true, flags: \JSON_THROW_ON_ERROR);
        \assert(\is_array($tables));

        return new AuditActionView(
            $row->string('id'),
            $row->int('seq'),
            $row->string('kind'),
            $row->nullableString('user_id'),
            $row->string('user_name'),
            $row->string('label'),
            new DateTimeImmutable($row->string('occurred_at'))->setTimezone(new DateTimeZone('Europe/Madrid'))->format(\DATE_ATOM),
            $row->int('change_count'),
            array_values(array_unique(array_map(static fn (mixed $t): string => AuditLabels::table((string) (\is_string($t) ? $t : '')), $tables))),
            $row->nullableString('reverts'),
            $row->int('revertible') > 0,
        );
    }

    /** @return array<string, mixed> */
    private static function json(?string $value): array
    {
        if (null === $value) {
            return [];
        }
        $decoded = json_decode($value, true, flags: \JSON_THROW_ON_ERROR);

        /** @var array<string, mixed> $decoded */
        return \is_array($decoded) ? $decoded : [];
    }
}

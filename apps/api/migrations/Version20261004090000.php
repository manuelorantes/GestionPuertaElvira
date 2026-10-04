<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Historial de acciones (ver specs/decisions/historial-de-cambios-con-triggers.md):
 * tablas audit_action y audit_change, trigger de captura en cada tabla de datos y función de reversión.
 */
final class Version20261004090000 extends AbstractMigration
{
    /** Tablas del club que se registran, con su clave primaria. */
    private const array TABLES = [
        'accounting_closing' => ['start_year'],
        'accounting_entry' => ['id'],
        'accounting_invoice' => ['id'],
        'billing_account' => ['student_id'],
        'billing_charge' => ['id'],
        'billing_document_sequence' => ['prefix', 'season_year'],
        'billing_payment' => ['id'],
        'billing_settings' => ['id'],
        'classes_enrolment' => ['id'],
        'classes_group' => ['id'],
        'identity_user' => ['id'],
        'payroll_proposed_month' => ['month'],
        'payroll_session' => ['id'],
        'payroll_settlement' => ['teacher_id', 'month'],
        'students_student' => ['id'],
        'teachers_teacher' => ['id'],
    ];

    public function getDescription(): string
    {
        return 'Historial de acciones con instantáneas de cada cambio y reversión';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE audit_action (
                id UUID PRIMARY KEY,
                seq BIGSERIAL UNIQUE NOT NULL,
                kind VARCHAR(12) NOT NULL,
                user_id UUID,
                user_name VARCHAR(120) NOT NULL,
                label VARCHAR(160) NOT NULL,
                occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                reverts UUID
            )
            SQL);
        $this->addSql('CREATE INDEX audit_action_user_idx ON audit_action (user_id)');
        $this->addSql(<<<'SQL'
            CREATE TABLE audit_change (
                id BIGSERIAL PRIMARY KEY,
                action_id UUID NOT NULL REFERENCES audit_action (id),
                table_name VARCHAR(63) NOT NULL,
                row_key JSONB NOT NULL,
                operation CHAR(1) NOT NULL,
                before JSONB,
                after JSONB
            )
            SQL);
        $this->addSql('CREATE INDEX audit_change_action_idx ON audit_change (action_id)');
        $this->addSql('CREATE INDEX audit_change_row_idx ON audit_change (table_name, row_key)');

        // Captura: agrupa por la acción de la petición (variables de sesión) o crea una «Sistema» por transacción.
        $this->addSql(<<<'SQL'
            CREATE FUNCTION audit_capture() RETURNS trigger LANGUAGE plpgsql AS $$
            DECLARE
                v_action UUID := NULLIF(current_setting('audit.action_id', true), '')::uuid;
                v_row JSONB;
                v_key JSONB;
            BEGIN
                IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
                    RETURN NULL;
                END IF;
                IF v_action IS NULL THEN
                    v_action := gen_random_uuid();
                    PERFORM set_config('audit.action_id', v_action::text, true);
                END IF;
                INSERT INTO audit_action (id, kind, user_id, user_name, label)
                VALUES (
                    v_action,
                    COALESCE(NULLIF(current_setting('audit.kind', true), ''), 'change'),
                    NULLIF(current_setting('audit.user_id', true), '')::uuid,
                    COALESCE(NULLIF(current_setting('audit.user_name', true), ''), 'Sistema'),
                    COALESCE(NULLIF(current_setting('audit.label', true), ''), 'Cambio desde la consola')
                )
                ON CONFLICT (id) DO NOTHING;
                v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
                SELECT jsonb_object_agg(k, v_row -> k) INTO v_key FROM unnest(TG_ARGV) AS k;
                INSERT INTO audit_change (action_id, table_name, row_key, operation, before, after)
                VALUES (
                    v_action, TG_TABLE_NAME, v_key, left(TG_OP, 1),
                    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
                    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
                );
                RETURN NULL;
            END $$
            SQL);

        // Reversión de un cambio: alta → borrar; baja → volver a insertar; cambio → restaurar la fila anterior.
        $this->addSql(<<<'SQL'
            CREATE FUNCTION audit_revert_change(p_change BIGINT) RETURNS void LANGUAGE plpgsql AS $$
            DECLARE
                c audit_change%ROWTYPE;
                v_where TEXT;
                v_set TEXT;
            BEGIN
                SELECT * INTO c FROM audit_change WHERE id = p_change;
                SELECT string_agg(format('t.%I = %L', k, c.row_key ->> k), ' AND ') INTO v_where FROM jsonb_object_keys(c.row_key) AS k;
                IF c.operation = 'I' THEN
                    EXECUTE format('DELETE FROM %I t WHERE %s', c.table_name, v_where);
                ELSIF c.operation = 'D' THEN
                    EXECUTE format('INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, %L)', c.table_name, c.table_name, c.before);
                ELSE
                    SELECT string_agg(format('%I = r.%I', k, k), ', ') INTO v_set FROM jsonb_object_keys(c.before) AS k;
                    EXECUTE format('UPDATE %I t SET %s FROM jsonb_populate_record(NULL::%I, %L) r WHERE %s', c.table_name, v_set, c.table_name, c.before, v_where);
                END IF;
            END $$
            SQL);

        foreach (self::TABLES as $table => $key) {
            $this->addSql(\sprintf(
                'CREATE TRIGGER %s_audit AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION audit_capture(%s)',
                $table,
                $table,
                implode(', ', array_map(static fn (string $column): string => "'{$column}'", $key)),
            ));
        }
    }

    public function down(Schema $schema): void
    {
        foreach (array_keys(self::TABLES) as $table) {
            $this->addSql(\sprintf('DROP TRIGGER IF EXISTS %s_audit ON %s', $table, $table));
        }
        $this->addSql('DROP FUNCTION IF EXISTS audit_revert_change(BIGINT)');
        $this->addSql('DROP FUNCTION IF EXISTS audit_capture()');
        $this->addSql('DROP TABLE audit_change');
        $this->addSql('DROP TABLE audit_action');
    }
}

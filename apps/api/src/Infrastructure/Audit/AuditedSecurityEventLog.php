<?php

declare(strict_types=1);

namespace App\Infrastructure\Audit;

use App\Application\Audit\AuditActionId;
use App\Application\Identity\Port\SecurityEventLog;
use App\Domain\Identity\UserId;
use App\Infrastructure\Identity\Logging\MonologSecurityEventLog;
use Doctrine\DBAL\Connection;

/** Los eventos de seguridad van al log y, además, al historial como acciones sin cambios de datos. */
final readonly class AuditedSecurityEventLog implements SecurityEventLog
{
    public function __construct(private MonologSecurityEventLog $logger, private Connection $connection)
    {
    }

    public function record(string $event, string $outcome, ?UserId $userId = null): void
    {
        $this->logger->record($event, $outcome, $userId);
        $this->connection->executeStatement(
            "INSERT INTO audit_action (id, kind, user_id, user_name, label)
             VALUES (:id, 'security', :user::uuid,
                     COALESCE((SELECT full_name FROM identity_user WHERE id = :user::uuid), NULLIF(current_setting('audit.user_name', true), ''), 'Desconocido'),
                     :label)",
            ['id' => AuditActionId::generate()->value, 'user' => $userId?->value, 'label' => AuditLabels::security($event, $outcome)],
        );
    }
}

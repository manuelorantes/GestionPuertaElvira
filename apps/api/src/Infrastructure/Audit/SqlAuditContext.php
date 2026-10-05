<?php

declare(strict_types=1);

namespace App\Infrastructure\Audit;

use App\Application\Audit\Port\AuditContext;
use Doctrine\DBAL\Connection;

final readonly class SqlAuditContext implements AuditContext
{
    public function __construct(private Connection $connection)
    {
    }

    public function relabel(string $label): void
    {
        $this->connection->executeQuery("SELECT set_config('audit.label', :label, false)", ['label' => mb_substr($label, 0, 160)]);
    }
}

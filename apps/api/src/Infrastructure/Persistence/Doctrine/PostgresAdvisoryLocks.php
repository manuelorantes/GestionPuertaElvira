<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine;

use App\Application\Common\Port\Locks;
use Doctrine\DBAL\Connection;
use LogicException;

/** Bloqueos `pg_advisory_xact_lock`: se liberan solos al confirmar o deshacer la transacción. */
final readonly class PostgresAdvisoryLocks implements Locks
{
    public function __construct(private Connection $connection)
    {
    }

    public function acquire(string $key): void
    {
        if (!$this->connection->isTransactionActive()) {
            throw new LogicException('Los bloqueos solo tienen sentido dentro de una transacción.');
        }
        $this->connection->executeStatement('SELECT pg_advisory_xact_lock(hashtext(:key))', ['key' => $key]);
    }
}

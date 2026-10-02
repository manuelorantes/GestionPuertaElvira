<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine;

use App\Application\Health\Port\DatabaseHealth;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception as DbalException;

final readonly class DoctrineDatabaseHealth implements DatabaseHealth
{
    public function __construct(private Connection $connection)
    {
    }

    public function isReachable(): bool
    {
        try {
            $this->connection->executeQuery('SELECT 1');

            return true;
        } catch (DbalException) {
            // Fallo operacional esperado: la comprobación de salud lo informa en vez de propagarlo.
            return false;
        }
    }
}

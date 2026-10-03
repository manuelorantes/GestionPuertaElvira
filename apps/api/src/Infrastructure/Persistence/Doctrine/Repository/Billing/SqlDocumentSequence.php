<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Billing;

use App\Application\Billing\Port\DocumentSequence;
use App\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;

/**
 * Incremento atómico con bloqueo de fila: dos cobros simultáneos nunca reciben el mismo número,
 * y si la transacción se deshace el número vuelve a quedar libre (sin huecos).
 */
final readonly class SqlDocumentSequence implements DocumentSequence
{
    public function __construct(private Connection $connection)
    {
    }

    public function next(string $prefix, int $seasonYear): int
    {
        $value = $this->connection->fetchOne(
            'INSERT INTO billing_document_sequence (prefix, season_year, last_value) VALUES (:prefix, :year, 1)
             ON CONFLICT (prefix, season_year) DO UPDATE SET last_value = billing_document_sequence.last_value + 1
             RETURNING last_value',
            ['prefix' => $prefix, 'year' => $seasonYear],
        );

        return new Row(['value' => $value])->int('value');
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Accounting;

use App\Application\Common\Port\ClosedPeriods;
use App\Domain\Accounting\FiscalYear;
use App\Domain\Common\LocalDate;
use Doctrine\DBAL\Connection;

final readonly class SqlClosedPeriods implements ClosedPeriods
{
    public function __construct(private Connection $connection)
    {
    }

    public function isClosed(LocalDate $date): bool
    {
        return false !== $this->connection->fetchOne('SELECT 1 FROM accounting_closing WHERE start_year = :year', ['year' => FiscalYear::of($date)->startYear]);
    }
}

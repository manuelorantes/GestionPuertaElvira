<?php

declare(strict_types=1);

namespace App\Infrastructure\Accounting;

use App\Application\Accounting\InvoiceView;
use App\Application\Accounting\Port\InvoiceQuery;
use App\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;

final readonly class SqlInvoiceQuery implements InvoiceQuery
{
    public function __construct(private Connection $connection)
    {
    }

    public function all(): array
    {
        $rows = $this->connection->fetchAllAssociative('SELECT * FROM accounting_invoice ORDER BY invoice_date DESC, number DESC');

        return array_map(static function (array $values): InvoiceView {
            $row = new Row($values);

            return new InvoiceView(
                $row->string('id'),
                $row->string('invoice_date'),
                $row->string('number'),
                $row->string('supplier'),
                $row->string('concept'),
                $row->string('category'),
                $row->int('amount_cents'),
                $row->nullableString('paid_on'),
                $row->nullableString('method'),
                $row->nullableString('attachment_name'),
            );
        }, $rows);
    }
}

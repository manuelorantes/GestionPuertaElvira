<?php

declare(strict_types=1);

namespace App\Application\Accounting\Port;

use App\Application\Accounting\InvoiceView;

interface InvoiceQuery
{
    /**
     * Facturas de proveedores, de la más reciente a la más antigua.
     *
     * @return list<InvoiceView>
     */
    public function all(): array;
}

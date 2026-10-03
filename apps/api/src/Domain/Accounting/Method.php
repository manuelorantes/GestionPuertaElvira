<?php

declare(strict_types=1);

namespace App\Domain\Accounting;

use App\Domain\Common\InvalidValue;

enum Method: string
{
    case Cash = 'cash';
    case Transfer = 'transfer';
    case Card = 'card';

    public static function fromName(string $name): self
    {
        return self::tryFrom($name) ?? throw new InvalidValue('method', 'Forma de pago desconocida.');
    }

    public function label(): string
    {
        return match ($this) {
            self::Cash => 'Efectivo',
            self::Transfer => 'Transferencia',
            self::Card => 'Tarjeta',
        };
    }
}

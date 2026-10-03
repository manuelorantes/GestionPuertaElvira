<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Common\InvalidValue;

enum PaymentMethod: string
{
    case Cash = 'cash';
    case Transfer = 'transfer';

    public static function fromName(string $name): self
    {
        return self::tryFrom($name) ?? throw new InvalidValue('method', 'Forma de pago desconocida: usa cash o transfer.');
    }

    public function label(): string
    {
        return match ($this) {
            self::Cash => 'Efectivo',
            self::Transfer => 'Transferencia',
        };
    }
}

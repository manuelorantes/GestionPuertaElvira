<?php

declare(strict_types=1);

namespace App\Domain\Billing\Error;

use App\Domain\Common\HasErrorDetails;
use DomainException;

final class InvalidPaymentRequest extends DomainException implements HasErrorDetails
{
    private function __construct(string $message, private readonly string $reason)
    {
        parent::__construct($message);
    }

    public static function months(): self
    {
        return new self('Se pueden cobrar entre 1 y 10 meses.', 'invalid_months');
    }

    public static function prorationRequiresOneMonth(): self
    {
        return new self('El prorrateo solo se aplica al cobrar un único mes.', 'proration_requires_one_month');
    }

    public static function beyondSeason(int $available): self
    {
        return new self(\sprintf('Solo quedan %d meses de temporada por cobrar.', $available), 'beyond_season');
    }

    public static function nothingToPay(): self
    {
        return new self('No hay nada pendiente que cobrar con esos datos.', 'nothing_to_pay');
    }

    public function reason(): string
    {
        return $this->reason;
    }

    public function details(): array
    {
        return ['reason' => $this->reason];
    }
}

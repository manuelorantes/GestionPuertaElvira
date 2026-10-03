<?php

declare(strict_types=1);

namespace App\Domain\Common;

/**
 * Importe en euros guardado en céntimos (enteros) para evitar errores de redondeo.
 */
final readonly class Money
{
    private function __construct(public int $cents)
    {
    }

    public static function cents(int $cents): self
    {
        return new self($cents);
    }

    public static function euros(int $euros): self
    {
        return new self($euros * 100);
    }

    public static function zero(): self
    {
        return new self(0);
    }

    /** Acepta «30», «30,5» o «30.50». */
    public static function fromDecimal(string $value): self
    {
        $normalised = str_replace(',', '.', trim($value));
        if (1 !== preg_match('/^-?\d+(\.\d{1,2})?$/', $normalised)) {
            throw new InvalidValue('amount', 'El importe no es válido.');
        }

        return new self((int) round((float) $normalised * 100));
    }

    public function plus(self $other): self
    {
        return new self($this->cents + $other->cents);
    }

    public function minus(self $other): self
    {
        return new self($this->cents - $other->cents);
    }

    public function times(int|float $factor): self
    {
        return new self((int) round($this->cents * $factor));
    }

    /** Porcentaje del importe, redondeado al céntimo (mitad hacia arriba). */
    public function percent(int|float $percentage): self
    {
        return new self((int) round($this->cents * $percentage / 100));
    }

    public function isNegative(): bool
    {
        return $this->cents < 0;
    }

    public function equals(self $other): bool
    {
        return $this->cents === $other->cents;
    }

    public function format(): string
    {
        $absolute = abs($this->cents);
        $decimals = 0 === $absolute % 100 ? 0 : 2;

        return ($this->cents < 0 ? '−' : '').number_format($absolute / 100, $decimals, ',', '.').' €';
    }
}

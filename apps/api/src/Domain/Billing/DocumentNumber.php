<?php

declare(strict_types=1);

namespace App\Domain\Billing;

/** Número correlativo por temporada: R-2026-0001 (recibos) o F-2026-0001 (facturas). */
final readonly class DocumentNumber
{
    private function __construct(public string $prefix, public int $seasonYear, public int $sequence)
    {
    }

    public static function receipt(int $seasonYear, int $sequence): self
    {
        return new self('R', $seasonYear, $sequence);
    }

    public static function invoice(int $seasonYear, int $sequence): self
    {
        return new self('F', $seasonYear, $sequence);
    }

    public static function fromString(string $value): self
    {
        [$prefix, $year, $sequence] = explode('-', $value) + ['', '0', '0'];

        return new self($prefix, (int) $year, (int) $sequence);
    }

    public function toString(): string
    {
        return \sprintf('%s-%d-%04d', $this->prefix, $this->seasonYear, $this->sequence);
    }
}

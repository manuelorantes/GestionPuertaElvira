<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine;

use Webmozart\Assert\Assert;

/**
 * Lectura tipada de una fila SQL: falla rápido si la columna no tiene el tipo esperado.
 */
final readonly class Row
{
    /** @param array<string, mixed> $values */
    public function __construct(private array $values)
    {
    }

    public function string(string $column): string
    {
        $value = $this->values[$column] ?? null;
        Assert::string($value, "Columna {$column}: se esperaba texto");

        return $value;
    }

    public function nullableString(string $column): ?string
    {
        return null === ($this->values[$column] ?? null) ? null : $this->string($column);
    }

    public function int(string $column): int
    {
        $value = $this->values[$column] ?? null;
        Assert::true(\is_int($value) || (\is_string($value) && is_numeric($value)), "Columna {$column}: se esperaba un número");

        return (int) $value;
    }

    public function bool(string $column): bool
    {
        $value = $this->values[$column] ?? null;
        Assert::boolean($value, "Columna {$column}: se esperaba un booleano");

        return $value;
    }

    /** @return list<int> */
    public function intListFromJson(string $column): array
    {
        $decoded = json_decode($this->string($column), true, flags: \JSON_THROW_ON_ERROR);
        Assert::isList($decoded);
        Assert::allInteger($decoded);

        return $decoded;
    }

    /** @return list<string> */
    public function stringListFromJson(string $column): array
    {
        $decoded = json_decode($this->string($column), true, flags: \JSON_THROW_ON_ERROR);
        Assert::isList($decoded);
        Assert::allString($decoded);

        return $decoded;
    }
}

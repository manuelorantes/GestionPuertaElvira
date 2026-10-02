<?php

declare(strict_types=1);

namespace App\Infrastructure\Http;

use App\Domain\Common\InvalidValue;
use Symfony\Component\HttpFoundation\Request;

/**
 * Lectura estricta de un cuerpo JSON: cada campo se pide con su tipo y si es obligatorio.
 */
final readonly class JsonBody
{
    /** @param array<mixed> $data */
    private function __construct(private array $data)
    {
    }

    public static function from(Request $request): self
    {
        $data = json_decode($request->getContent(), true);

        return new self(\is_array($data) ? $data : []);
    }

    public function requiredString(string $field): string
    {
        $value = $this->data[$field] ?? null;
        if (!\is_string($value) || '' === trim($value)) {
            throw self::missing($field);
        }

        return $value;
    }

    public function optionalString(string $field): ?string
    {
        $value = $this->data[$field] ?? null;
        if (null === $value || '' === $value) {
            return null;
        }
        if (!\is_string($value)) {
            throw new InvalidValue($field, \sprintf('El campo «%s» debe ser texto.', $field));
        }

        return $value;
    }

    public function requiredInt(string $field): int
    {
        $value = $this->data[$field] ?? null;
        if (!\is_int($value)) {
            throw self::missing($field);
        }

        return $value;
    }

    public function bool(string $field, bool $default = false): bool
    {
        $value = $this->data[$field] ?? $default;
        if (!\is_bool($value)) {
            throw new InvalidValue($field, \sprintf('El campo «%s» debe ser verdadero o falso.', $field));
        }

        return $value;
    }

    /** @return list<string> */
    public function stringList(string $field): array
    {
        $value = $this->data[$field] ?? [];
        if (!\is_array($value) || !array_is_list($value) || [] !== array_filter($value, static fn ($item): bool => !\is_string($item))) {
            throw new InvalidValue($field, \sprintf('El campo «%s» debe ser una lista de textos.', $field));
        }

        /** @var list<string> $value */
        return $value;
    }

    /** @return list<array<mixed>> */
    public function objectList(string $field): array
    {
        $value = $this->data[$field] ?? [];
        if (!\is_array($value) || !array_is_list($value) || [] !== array_filter($value, static fn ($item): bool => !\is_array($item))) {
            throw new InvalidValue($field, \sprintf('El campo «%s» debe ser una lista.', $field));
        }

        /** @var list<array<mixed>> $value */
        return $value;
    }

    private static function missing(string $field): InvalidValue
    {
        return new InvalidValue($field, \sprintf('El campo «%s» es obligatorio.', $field));
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Http;

use App\Domain\Common\InvalidValue;
use Symfony\Component\HttpFoundation\Request;

/**
 * Lectura estricta de campos de texto obligatorios de un cuerpo JSON.
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
        if (!\is_string($value) || '' === $value) {
            throw new InvalidValue($field, \sprintf('El campo «%s» es obligatorio.', $field));
        }

        return $value;
    }
}

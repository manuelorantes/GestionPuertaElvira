<?php

declare(strict_types=1);

namespace App\Domain\Common;

use Stringable;

/**
 * Identificador UUIDv7 (ordenable por tiempo), sin dependencias externas.
 */
abstract readonly class Uuid implements Stringable
{
    private const string PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/';

    final protected function __construct(public string $value)
    {
    }

    public static function generate(): static
    {
        $milliseconds = (int) (microtime(true) * 1000);
        $bytes = substr(pack('J', $milliseconds), 2).random_bytes(10);
        $bytes[6] = \chr((\ord($bytes[6]) & 0x0F) | 0x70);
        $bytes[8] = \chr((\ord($bytes[8]) & 0x3F) | 0x80);
        $hex = bin2hex($bytes);

        return new static(\sprintf('%s-%s-%s-%s-%s', substr($hex, 0, 8), substr($hex, 8, 4), substr($hex, 12, 4), substr($hex, 16, 4), substr($hex, 20)));
    }

    public static function fromString(string $value): static
    {
        $normalised = strtolower($value);

        if (1 !== preg_match(self::PATTERN, $normalised)) {
            throw new InvalidValue('id', 'Identificador no válido.');
        }

        return new static($normalised);
    }

    public function equals(self $other): bool
    {
        return static::class === $other::class && $this->value === $other->value;
    }

    public function __toString(): string
    {
        return $this->value;
    }
}

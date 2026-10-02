<?php

declare(strict_types=1);

namespace App\Domain\Identity;

use App\Domain\Common\InvalidValue;
use SensitiveParameter;
use Stringable;

/**
 * Contraseña en claro. Solo vive en memoria durante la petición: nunca se imprime ni se registra.
 */
final readonly class PlainPassword implements Stringable
{
    private const int MAX_LENGTH = 4096;

    private function __construct(#[SensitiveParameter] private string $secret)
    {
    }

    public static function fromString(#[SensitiveParameter] string $secret): self
    {
        if (\strlen($secret) > self::MAX_LENGTH) {
            throw new InvalidValue('password', 'La contraseña es demasiado larga.');
        }

        return new self($secret);
    }

    public function reveal(): string
    {
        return $this->secret;
    }

    public function length(): int
    {
        return mb_strlen($this->secret);
    }

    public function __toString(): string
    {
        return '[oculta]';
    }

    /** @return array<string, string> */
    public function __debugInfo(): array
    {
        return ['secret' => '[oculta]'];
    }
}

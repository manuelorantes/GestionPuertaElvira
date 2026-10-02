<?php

declare(strict_types=1);

namespace App\Domain\Identity;

use App\Domain\Common\InvalidValue;

final readonly class EmailAddress
{
    private const int MAX_LENGTH = 254;

    private function __construct(public string $value)
    {
    }

    public static function fromString(string $email): self
    {
        $normalised = mb_strtolower(trim($email));

        if (mb_strlen($normalised) > self::MAX_LENGTH || 1 !== preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/u', $normalised)) {
            throw new InvalidValue('email', 'El email no tiene un formato válido.');
        }

        return new self($normalised);
    }

    public function equals(self $other): bool
    {
        return $this->value === $other->value;
    }
}

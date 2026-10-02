<?php

declare(strict_types=1);

namespace App\Infrastructure\Logging;

use Symfony\Component\Uid\Uuid;
use Symfony\Contracts\Service\ResetInterface;

/**
 * Identificador de la petición en curso, compartido por el subscriber HTTP y el procesador de logs.
 */
final class RequestId implements ResetInterface
{
    private ?string $value = null;

    public function renew(): void
    {
        $this->value = Uuid::v7()->toRfc4122();
    }

    public function current(): string
    {
        return $this->value ??= Uuid::v7()->toRfc4122();
    }

    public function reset(): void
    {
        $this->value = null;
    }
}

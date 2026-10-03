<?php

declare(strict_types=1);

namespace App\Application\Accounting\Port;

/** Almacén de documentos adjuntos (sistema de ficheros en local; S3 al desplegar). */
interface DocumentStorage
{
    public function put(string $key, string $contents): void;

    public function read(string $key): string;

    public function remove(string $key): void;
}

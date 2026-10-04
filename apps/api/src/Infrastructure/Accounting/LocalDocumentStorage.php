<?php

declare(strict_types=1);

namespace App\Infrastructure\Accounting;

use App\Application\Accounting\Error\DocumentNotFound;
use App\Application\Accounting\Port\DocumentStorage;
use InvalidArgumentException;
use RuntimeException;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/** Documentos en el sistema de ficheros local (`var/storage`). Al desplegar se sustituirá por S3. */
final readonly class LocalDocumentStorage implements DocumentStorage
{
    public function __construct(
        #[Autowire('%kernel.project_dir%/var/storage/%kernel.environment%')]
        private string $root,
    ) {
    }

    public function put(string $key, string $contents): void
    {
        $directory = \dirname($this->path($key));
        if (!is_dir($directory) && !mkdir($directory, 0o775, true) && !is_dir($directory)) {
            throw new RuntimeException('No se ha podido crear la carpeta de documentos.');
        }
        if (false === file_put_contents($this->path($key), $contents)) {
            throw new RuntimeException('No se ha podido guardar el documento.');
        }
    }

    public function read(string $key): string
    {
        $contents = is_file($this->path($key)) ? file_get_contents($this->path($key)) : false;

        return false === $contents ? throw new DocumentNotFound() : $contents;
    }

    /**
     * No se borra el fichero: el historial puede devolver la factura o el documento anterior
     * (ver historial-de-cambios-con-triggers.md). Solo se comprueba que la clave es válida.
     */
    public function remove(string $key): void
    {
        $this->path($key);
    }

    /** Solo claves generadas por la aplicación: evita salir de la carpeta de documentos. */
    private function path(string $key): string
    {
        if (1 !== preg_match('#^[a-z]+(/[0-9a-f-]{36})+\.[a-z]{3,4}$#', $key)) {
            throw new InvalidArgumentException('Clave de documento no válida.');
        }

        return $this->root.'/'.$key;
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Accounting;

use App\Domain\Common\InvalidValue;

/** Documento adjunto a una factura: PDF o foto de hasta 10 MB. */
final readonly class Attachment
{
    public const int MAX_BYTES = 10 * 1024 * 1024;
    public const array TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

    public function __construct(public string $key, public string $originalName, public string $mimeType, public int $bytes)
    {
        if (!\in_array($mimeType, self::TYPES, true)) {
            throw new InvalidValue('file', 'El documento debe ser un PDF o una foto (JPG, PNG o WEBP).');
        }
        if ($bytes <= 0 || $bytes > self::MAX_BYTES) {
            throw new InvalidValue('file', 'El documento no puede superar los 10 MB.');
        }
    }
}

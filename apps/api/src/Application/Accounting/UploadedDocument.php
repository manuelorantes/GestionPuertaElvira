<?php

declare(strict_types=1);

namespace App\Application\Accounting;

final readonly class UploadedDocument
{
    public function __construct(public string $originalName, public string $mimeType, public string $contents)
    {
    }
}

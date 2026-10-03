<?php

declare(strict_types=1);

namespace App\Application\Accounting;

use App\Application\Accounting\Port\DocumentStorage;
use App\Domain\Accounting\Attachment;

/** Valida y guarda un documento subido, devolviendo su adjunto. */
final class Documents
{
    private const array EXTENSIONS = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    public static function store(DocumentStorage $storage, string $invoiceId, UploadedDocument $document): Attachment
    {
        $key = \sprintf('invoices/%s/%s.%s', $invoiceId, DocumentKey::generate()->value, self::EXTENSIONS[$document->mimeType] ?? 'bin');
        $attachment = new Attachment($key, basename($document->originalName), $document->mimeType, \strlen($document->contents));
        $storage->put($key, $document->contents);

        return $attachment;
    }
}

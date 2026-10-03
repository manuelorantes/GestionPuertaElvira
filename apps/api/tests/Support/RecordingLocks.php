<?php

declare(strict_types=1);

namespace App\Tests\Support;

use App\Application\Common\Port\Locks;

/** Doble de los bloqueos: apunta las claves pedidas. */
final class RecordingLocks implements Locks
{
    /** @var list<string> */
    public array $keys = [];

    public function acquire(string $key): void
    {
        $this->keys[] = $key;
    }
}

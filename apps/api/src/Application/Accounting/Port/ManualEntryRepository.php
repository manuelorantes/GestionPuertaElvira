<?php

declare(strict_types=1);

namespace App\Application\Accounting\Port;

use App\Domain\Accounting\ManualEntry;
use App\Domain\Accounting\ManualEntryId;

interface ManualEntryRepository
{
    public function entry(ManualEntryId $id): ?ManualEntry;

    public function saveEntry(ManualEntry $entry): void;

    public function deleteEntry(ManualEntryId $id): void;
}

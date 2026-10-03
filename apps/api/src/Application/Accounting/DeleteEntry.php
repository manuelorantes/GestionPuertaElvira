<?php

declare(strict_types=1);

namespace App\Application\Accounting;

use App\Application\Accounting\Error\EntryNotFound;
use App\Application\Accounting\Port\ManualEntryRepository;
use App\Application\Common\Error\PeriodClosed;
use App\Application\Common\Port\ClosedPeriods;
use App\Domain\Accounting\ManualEntryId;

final readonly class DeleteEntry
{
    public function __construct(private ManualEntryRepository $entries, private ClosedPeriods $closed)
    {
    }

    public function __invoke(string $id): void
    {
        $entry = $this->entries->entry(ManualEntryId::fromString($id)) ?? throw new EntryNotFound();
        PeriodClosed::guard($this->closed, $entry->date);
        $this->entries->deleteEntry($entry->id);
    }
}

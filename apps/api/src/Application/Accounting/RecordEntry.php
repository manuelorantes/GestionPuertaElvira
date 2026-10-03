<?php

declare(strict_types=1);

namespace App\Application\Accounting;

use App\Application\Accounting\Port\ManualEntryRepository;
use App\Application\Common\Error\PeriodClosed;
use App\Application\Common\Port\ClosedPeriods;
use App\Domain\Accounting\EntryKind;
use App\Domain\Accounting\LedgerCategory;
use App\Domain\Accounting\ManualEntry;
use App\Domain\Accounting\ManualEntryId;
use App\Domain\Accounting\Method;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;

final readonly class RecordEntry
{
    public function __construct(private ManualEntryRepository $entries, private ClosedPeriods $closed)
    {
    }

    public function __invoke(EntryInput $input): string
    {
        $date = LocalDate::fromString($input->date);
        PeriodClosed::guard($this->closed, $date);
        $entry = ManualEntry::record(
            ManualEntryId::generate(),
            $date,
            EntryKind::tryFrom($input->kind) ?? throw new InvalidValue('kind', 'Indica si es un ingreso o un gasto.'),
            $input->concept,
            LedgerCategory::fromName($input->category),
            Method::fromName($input->method),
            Money::fromDecimal($input->amount),
        );
        $this->entries->saveEntry($entry);

        return $entry->id->value;
    }
}

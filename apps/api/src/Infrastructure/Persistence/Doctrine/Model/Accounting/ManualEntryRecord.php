<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Accounting;

use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'accounting_entry')]
#[ORM\Index(name: 'accounting_entry_date_idx', columns: ['entry_date'])]
class ManualEntryRecord
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $id,
        #[ORM\Column(type: Types::DATE_IMMUTABLE)]
        public DateTimeImmutable $entryDate,
        #[ORM\Column(length: 10)]
        public string $kind,
        #[ORM\Column(length: 120)]
        public string $concept,
        #[ORM\Column(length: 20)]
        public string $category,
        #[ORM\Column(length: 10)]
        public string $method,
        #[ORM\Column]
        public int $amountCents,
    ) {
    }
}

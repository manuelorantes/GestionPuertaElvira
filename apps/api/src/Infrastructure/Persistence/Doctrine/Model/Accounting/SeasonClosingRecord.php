<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Accounting;

use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'accounting_closing')]
class SeasonClosingRecord
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::SMALLINT)]
        public int $startYear,
        #[ORM\Column]
        public int $incomeCents,
        #[ORM\Column]
        public int $expenseCents,
        #[ORM\Column(type: Types::DATE_IMMUTABLE)]
        public DateTimeImmutable $closedOn,
    ) {
    }
}

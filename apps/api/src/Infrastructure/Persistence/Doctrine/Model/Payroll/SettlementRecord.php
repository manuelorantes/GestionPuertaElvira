<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Payroll;

use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'payroll_settlement')]
class SettlementRecord
{
    /** @param list<array{label: string, minutes: int, amountCents: int}> $lines */
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $teacherId,
        #[ORM\Id]
        #[ORM\Column(length: 7)]
        public string $month,
        #[ORM\Column]
        public int $minutes,
        #[ORM\Column]
        public int $rateCents,
        #[ORM\Column]
        public int $amountCents,
        #[ORM\Column(type: Types::JSON)]
        public array $lines,
        #[ORM\Column(type: Types::DATE_IMMUTABLE)]
        public DateTimeImmutable $paidOn,
    ) {
    }
}

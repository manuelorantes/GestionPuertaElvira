<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Billing;

use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'billing_charge')]
#[ORM\UniqueConstraint(name: 'billing_charge_unique', columns: ['student_id', 'kind', 'period'])]
#[ORM\Index(name: 'billing_charge_period_idx', columns: ['period'])]
class ChargeRecord
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $id,
        #[ORM\Column(type: Types::GUID)]
        public string $studentId,
        #[ORM\Column(length: 12)]
        public string $kind,
        #[ORM\Column(length: 7)]
        public string $period,
        #[ORM\Column]
        public int $amountCents,
        #[ORM\Column(type: Types::GUID, nullable: true)]
        public ?string $paidBy,
        #[ORM\Column(type: Types::DATE_IMMUTABLE, nullable: true)]
        public ?DateTimeImmutable $remindedOn,
    ) {
    }
}

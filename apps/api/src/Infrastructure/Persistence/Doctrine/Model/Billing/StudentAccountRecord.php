<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Billing;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'billing_account')]
class StudentAccountRecord
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $studentId,
        #[ORM\Column(length: 20)]
        public string $preferredPlan,
        #[ORM\Column]
        public bool $member,
        #[ORM\Column(nullable: true)]
        public ?int $privateRateCents,
        #[ORM\Column]
        public int $points,
    ) {
    }
}

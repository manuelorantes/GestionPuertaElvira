<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Payroll;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'payroll_proposed_month')]
class ProposedMonthRecord
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(length: 7)]
        public string $month,
    ) {
    }
}

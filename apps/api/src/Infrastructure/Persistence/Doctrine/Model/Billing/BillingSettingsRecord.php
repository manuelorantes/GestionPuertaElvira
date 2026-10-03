<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Billing;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/** Una sola fila (`club`) con los ajustes serializados. */
#[ORM\Entity]
#[ORM\Table(name: 'billing_settings')]
class BillingSettingsRecord
{
    /** @param array<string, mixed> $data */
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(length: 20)]
        public string $id,
        #[ORM\Column(type: Types::JSON)]
        public array $data,
    ) {
    }
}

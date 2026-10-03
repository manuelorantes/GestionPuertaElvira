<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Billing;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/** Último número usado por tipo de documento y temporada (se actualiza con SQL atómico). */
#[ORM\Entity]
#[ORM\Table(name: 'billing_document_sequence')]
class DocumentSequenceRecord
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(length: 1)]
        public string $prefix,
        #[ORM\Id]
        #[ORM\Column(type: Types::SMALLINT)]
        public int $seasonYear,
        #[ORM\Column]
        public int $lastValue,
    ) {
    }
}

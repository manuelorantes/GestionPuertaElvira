<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Accounting;

use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'accounting_invoice')]
#[ORM\Index(name: 'accounting_invoice_paid_idx', columns: ['paid_on'])]
class SupplierInvoiceRecord
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $id,
        #[ORM\Column(type: Types::DATE_IMMUTABLE)]
        public DateTimeImmutable $invoiceDate,
        #[ORM\Column(length: 40)]
        public string $number,
        #[ORM\Column(length: 120)]
        public string $supplier,
        #[ORM\Column(length: 120)]
        public string $concept,
        #[ORM\Column(length: 20)]
        public string $category,
        #[ORM\Column]
        public int $amountCents,
        #[ORM\Column(type: Types::DATE_IMMUTABLE, nullable: true)]
        public ?DateTimeImmutable $paidOn = null,
        #[ORM\Column(length: 10, nullable: true)]
        public ?string $method = null,
        #[ORM\Column(length: 200, nullable: true)]
        public ?string $attachmentKey = null,
        #[ORM\Column(length: 200, nullable: true)]
        public ?string $attachmentName = null,
        #[ORM\Column(length: 40, nullable: true)]
        public ?string $attachmentType = null,
        #[ORM\Column(nullable: true)]
        public ?int $attachmentBytes = null,
    ) {
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Billing;

use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'billing_payment')]
#[ORM\Index(name: 'billing_payment_student_idx', columns: ['student_id'])]
class PaymentRecord
{
    /**
     * @param list<array{label: string, amountCents: int}> $lines
     * @param list<string>                                 $periods
     * @param array<string, mixed>|null                    $invoice
     */
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $id,
        #[ORM\Column(type: Types::GUID)]
        public string $studentId,
        #[ORM\Column(type: Types::DATE_IMMUTABLE)]
        public DateTimeImmutable $paidOn,
        #[ORM\Column(length: 10)]
        public string $method,
        #[ORM\Column(length: 16, unique: true)]
        public string $receiptNumber,
        #[ORM\Column(length: 12)]
        public string $kind,
        #[ORM\Column(length: 120)]
        public string $concept,
        #[ORM\Column(type: Types::JSON)]
        public array $lines,
        #[ORM\Column]
        public int $totalCents,
        #[ORM\Column(type: Types::JSON)]
        public array $periods,
        #[ORM\Column(length: 16, unique: true, nullable: true)]
        public ?string $invoiceNumber,
        #[ORM\Column(type: Types::JSON, nullable: true)]
        public ?array $invoice,
    ) {
    }
}

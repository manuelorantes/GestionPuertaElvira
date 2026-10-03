<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Payroll;

use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'payroll_session')]
#[ORM\Index(name: 'payroll_session_date_idx', columns: ['session_date'])]
class SessionRecord
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $id,
        #[ORM\Column(type: Types::GUID)]
        public string $teacherId,
        #[ORM\Column(type: Types::DATE_IMMUTABLE)]
        public DateTimeImmutable $sessionDate,
        #[ORM\Column(type: Types::GUID, nullable: true)]
        public ?string $groupId,
        #[ORM\Column(length: 80)]
        public string $label,
        #[ORM\Column(type: Types::SMALLINT)]
        public int $minutes,
        #[ORM\Column]
        public bool $fromSchedule,
    ) {
    }
}

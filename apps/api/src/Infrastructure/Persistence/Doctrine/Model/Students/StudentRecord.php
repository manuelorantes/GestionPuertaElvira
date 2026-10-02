<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Students;

use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'students_student')]
#[ORM\Index(name: 'students_student_search_idx', columns: ['search_name'])]
class StudentRecord
{
    /**
     * @param list<array{name: string, phone: string}> $guardians
     * @param list<string>                             $siblingIds
     */
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $id,
        #[ORM\Column(length: 120)]
        public string $fullName,
        #[ORM\Column(length: 120)]
        public string $searchName,
        #[ORM\Column(type: Types::DATE_IMMUTABLE)]
        public DateTimeImmutable $birthDate,
        #[ORM\Column(length: 9, nullable: true)]
        public ?string $nationalId,
        #[ORM\Column(length: 254, nullable: true)]
        public ?string $contactEmail,
        #[ORM\Column(type: Types::JSON)]
        public array $guardians,
        #[ORM\Column(length: 12, nullable: true)]
        public ?string $ownPhone,
        #[ORM\Column(length: 20, nullable: true)]
        public ?string $federationLicence,
        #[ORM\Column]
        public bool $imageConsent,
        #[ORM\Column(type: Types::DATE_IMMUTABLE)]
        public DateTimeImmutable $joinedOn,
        #[ORM\Column(type: Types::DATE_IMMUTABLE, nullable: true)]
        public ?DateTimeImmutable $withdrawnOn,
        #[ORM\Column(type: Types::JSON)]
        public array $siblingIds,
    ) {
    }
}

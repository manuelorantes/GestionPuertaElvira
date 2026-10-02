<?php

declare(strict_types=1);

namespace App\Application\Students;

final readonly class StudentDetail
{
    /**
     * @param list<array{name: string, phone: string}>  $guardians
     * @param list<StudentGroup>                        $groups
     * @param list<array{id: string, fullName: string}> $siblings
     */
    public function __construct(
        public string $id,
        public string $fullName,
        public string $birthDate,
        public int $age,
        public ?string $nationalId,
        public ?string $contactEmail,
        public array $guardians,
        public ?string $ownPhone,
        public ?string $federationLicence,
        public bool $imageConsent,
        public string $joinedOn,
        public ?string $withdrawnOn,
        public string $status,
        public array $groups,
        public array $siblings,
    ) {
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Identity;

use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'identity_user')]
#[ORM\UniqueConstraint(name: 'identity_user_email_unique', columns: ['email'])]
class UserRecord
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $id,
        #[ORM\Column(length: 254)]
        public string $email,
        #[ORM\Column(length: 120)]
        public string $fullName,
        #[ORM\Column(length: 20)]
        public string $role,
        #[ORM\Column(length: 255)]
        public string $passwordHash,
        #[ORM\Column(length: 20)]
        public string $status,
        #[ORM\Column]
        public bool $mustChangePassword,
        #[ORM\Column(type: Types::DATETIMETZ_IMMUTABLE)]
        public DateTimeImmutable $createdAt,
        #[ORM\Column(type: Types::DATETIMETZ_IMMUTABLE)]
        public DateTimeImmutable $passwordChangedAt,
    ) {
    }
}

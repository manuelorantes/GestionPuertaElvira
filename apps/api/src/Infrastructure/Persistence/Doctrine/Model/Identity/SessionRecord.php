<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Identity;

use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'identity_session')]
#[ORM\UniqueConstraint(name: 'identity_session_token_hash_unique', columns: ['token_hash'])]
#[ORM\Index(name: 'identity_session_user_idx', columns: ['user_id'])]
class SessionRecord
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $id,
        #[ORM\Column(length: 64)]
        public string $tokenHash,
        #[ORM\Column(type: Types::GUID)]
        public string $userId,
        #[ORM\Column(type: Types::DATETIMETZ_IMMUTABLE)]
        public DateTimeImmutable $startedAt,
        #[ORM\Column(type: Types::DATETIMETZ_IMMUTABLE)]
        public DateTimeImmutable $lastActivityAt,
    ) {
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Identity;

use App\Application\Identity\Port\SessionRepository;
use App\Domain\Identity\Session;
use App\Domain\Identity\SessionId;
use App\Domain\Identity\SessionTokenHash;
use App\Domain\Identity\UserId;
use App\Infrastructure\Persistence\Doctrine\Mapper\Identity\SessionMapper;
use App\Infrastructure\Persistence\Doctrine\Model\Identity\SessionRecord;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineSessionRepository implements SessionRepository
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function findByTokenHash(SessionTokenHash $tokenHash): ?Session
    {
        $record = $this->em->getRepository(SessionRecord::class)->findOneBy(['tokenHash' => $tokenHash->value]);

        return null === $record ? null : SessionMapper::toDomain($record);
    }

    public function save(Session $session): void
    {
        $existing = $this->em->find(SessionRecord::class, $session->id()->value);
        $this->em->persist(SessionMapper::toRecord($session, $existing));
        $this->em->flush();
    }

    public function remove(SessionId $id): void
    {
        $record = $this->em->find(SessionRecord::class, $id->value);
        if (null !== $record) {
            $this->em->remove($record);
            $this->em->flush();
        }
    }

    public function removeAllForUser(UserId $userId, ?SessionId $except = null): void
    {
        $records = $this->em->getRepository(SessionRecord::class)->findBy(['userId' => $userId->value]);
        foreach ($records as $record) {
            if (null === $except || $record->id !== $except->value) {
                $this->em->remove($record);
            }
        }
        $this->em->flush();
    }
}

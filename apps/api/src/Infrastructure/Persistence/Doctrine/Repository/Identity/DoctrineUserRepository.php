<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Identity;

use App\Application\Identity\Port\UserRepository;
use App\Domain\Identity\EmailAddress;
use App\Domain\Identity\User;
use App\Domain\Identity\UserId;
use App\Infrastructure\Persistence\Doctrine\Mapper\Identity\UserMapper;
use App\Infrastructure\Persistence\Doctrine\Model\Identity\UserRecord;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineUserRepository implements UserRepository
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function find(UserId $id): ?User
    {
        $record = $this->em->find(UserRecord::class, $id->value);

        return null === $record ? null : UserMapper::toDomain($record);
    }

    public function findByEmail(EmailAddress $email): ?User
    {
        $record = $this->em->getRepository(UserRecord::class)->findOneBy(['email' => $email->value]);

        return null === $record ? null : UserMapper::toDomain($record);
    }

    public function save(User $user): void
    {
        $user->releaseEvents();
        $existing = $this->em->find(UserRecord::class, $user->id()->value);
        $this->em->persist(UserMapper::toRecord($user, $existing));
        $this->em->flush();
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Classes;

use App\Application\Classes\Port\ClassGroupRepository;
use App\Domain\Classes\ClassGroup;
use App\Domain\Classes\ClassGroupId;
use App\Infrastructure\Persistence\Doctrine\Model\Classes\ClassGroupRecord;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineClassGroupRepository implements ClassGroupRepository
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function find(ClassGroupId $id): ?ClassGroup
    {
        $record = $this->em->find(ClassGroupRecord::class, $id->value);

        return null === $record ? null : ClassGroupMapper::toDomain($record);
    }

    public function all(): array
    {
        return array_map(ClassGroupMapper::toDomain(...), $this->em->getRepository(ClassGroupRecord::class)->findAll());
    }

    public function save(ClassGroup $group): void
    {
        $this->em->persist(ClassGroupMapper::toRecord($group, $this->em->find(ClassGroupRecord::class, $group->id()->value)));
        $this->em->flush();
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Teachers;

use App\Application\Teachers\Port\TeacherRepository;
use App\Domain\Common\FullName;
use App\Domain\Teachers\Teacher;
use App\Domain\Teachers\TeacherId;
use App\Infrastructure\Persistence\Doctrine\Model\Teachers\TeacherRecord;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineTeacherRepository implements TeacherRepository
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function find(TeacherId $id): ?Teacher
    {
        $record = $this->em->find(TeacherRecord::class, $id->value);

        return null === $record ? null : Teacher::restore(TeacherId::fromString($record->id), FullName::fromString($record->fullName), $record->active);
    }

    public function save(Teacher $teacher): void
    {
        $record = $this->em->find(TeacherRecord::class, $teacher->id()->value)
            ?? new TeacherRecord($teacher->id()->value, $teacher->fullName()->value, $teacher->isActive());
        $record->fullName = $teacher->fullName()->value;
        $record->active = $teacher->isActive();
        $this->em->persist($record);
        $this->em->flush();
    }
}

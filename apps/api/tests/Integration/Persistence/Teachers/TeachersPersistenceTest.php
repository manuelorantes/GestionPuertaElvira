<?php

declare(strict_types=1);

namespace App\Tests\Integration\Persistence\Teachers;

use App\Domain\Common\FullName;
use App\Domain\Teachers\Teacher;
use App\Domain\Teachers\TeacherId;
use App\Infrastructure\Persistence\Doctrine\Repository\Teachers\DoctrineTeacherRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class TeachersPersistenceTest extends KernelTestCase
{
    public function test_should_save_restore_and_list_teachers_by_name(): void
    {
        $repository = self::getContainer()->get(DoctrineTeacherRepository::class);
        $zoe = Teacher::register(TeacherId::generate(), FullName::fromString('Zoe Ruiz'));
        $ana = Teacher::register(TeacherId::generate(), FullName::fromString('Ana Belén Torres'));
        $zoe->deactivate();
        $repository->save($zoe);
        $repository->save($ana);
        self::getContainer()->get(EntityManagerInterface::class)->clear();

        self::assertFalse($repository->find($zoe->id())?->isActive());

        $list = self::getContainer()->get(\App\Infrastructure\Teachers\SqlTeacherQuery::class)->all();
        self::assertSame(['Ana Belén Torres', 'Zoe Ruiz'], array_map(static fn ($t): string => $t->fullName, $list));
        self::assertSame([true, false], array_map(static fn ($t): bool => $t->active, $list));
        self::assertSame(0, $list[0]->groupCount);
    }
}

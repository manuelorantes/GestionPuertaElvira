<?php

declare(strict_types=1);

namespace App\Tests\Integration\Cli\DevTools;

use App\Domain\Common\LocalDate;
use App\Infrastructure\Classes\SqlClassQuery;
use App\Infrastructure\Teachers\SqlTeacherQuery;
use DateTimeImmutable;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Tester\CommandTester;

final class SeedDemoDataCommandTest extends KernelTestCase
{
    public function test_should_create_the_design_teachers_and_groups_once(): void
    {
        $tester = new CommandTester(new Application(self::bootKernel())->find('app:dev:seed-demo'));

        self::assertSame(Command::SUCCESS, $tester->execute([]));
        self::assertSame(Command::SUCCESS, $tester->execute([]));

        $container = self::getContainer();
        self::assertCount(5, $container->get(SqlTeacherQuery::class)->all());
        $groups = $container->get(SqlClassQuery::class)->groups(LocalDate::fromInstant(new DateTimeImmutable()));
        self::assertCount(18, $groups);
        self::assertContains('Competición', array_map(static fn ($g): string => $g->name, $groups));

        $students = $container->get(\App\Infrastructure\Students\SqlStudentQuery::class);
        self::assertSame(16, $students->total());
        self::assertCount(4, $students->list(\App\Application\Students\StudentFilter::Siblings, null, LocalDate::fromInstant(new DateTimeImmutable())));
        self::assertSame(16, array_sum(array_map(static fn ($g): int => $g->occupied, $groups)));
    }

    public function test_should_wipe_and_recreate_the_demo_data_when_asked_to_reset(): void
    {
        $tester = new CommandTester(new Application(self::bootKernel())->find('app:dev:seed-demo'));
        $tester->execute([]);
        self::getContainer()->get(\Doctrine\DBAL\Connection::class)->executeStatement("UPDATE classes_group SET name = 'Cambiado'");
        self::getContainer()->get(\Doctrine\DBAL\Connection::class)->executeStatement("UPDATE students_student SET full_name = 'Cambiado'");

        self::assertSame(Command::SUCCESS, $tester->execute(['--reset' => true]));

        $names = array_map(static fn ($g): string => $g->name, self::getContainer()->get(SqlClassQuery::class)->groups(LocalDate::fromInstant(new DateTimeImmutable())));
        self::assertCount(18, $names);
        self::assertNotContains('Cambiado', $names);
        self::assertCount(5, self::getContainer()->get(SqlTeacherQuery::class)->all());
        self::assertSame(16, self::getContainer()->get(\App\Infrastructure\Students\SqlStudentQuery::class)->total());
    }
}

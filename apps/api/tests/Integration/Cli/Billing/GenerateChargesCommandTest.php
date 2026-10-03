<?php

declare(strict_types=1);

namespace App\Tests\Integration\Cli\Billing;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Tester\CommandTester;

final class GenerateChargesCommandTest extends KernelTestCase
{
    public function test_should_generate_the_charges_of_a_month_idempotently(): void
    {
        $month = \App\Domain\Common\YearMonth::of(\App\Domain\Common\LocalDate::fromInstant(new DateTimeImmutable()));
        if (null === \App\Domain\Common\Season::teachingSeason($month)) {
            self::markTestSkipped('En julio y agosto no hay cuotas.');
        }
        $application = new Application(self::bootKernel());
        new CommandTester($application->find('app:dev:seed-demo'))->execute(['--reset' => true]);
        $tester = new CommandTester($application->find('app:billing:generate-charges'));
        $connection = self::getContainer()->get(Connection::class);

        $connection->executeStatement('DELETE FROM billing_charge WHERE period = :m AND paid_by IS NULL', ['m' => $month->toString()]);
        self::assertSame(Command::SUCCESS, $tester->execute(['--month' => $month->toString()]));
        $count = $connection->fetchOne("SELECT COUNT(*) FROM billing_charge WHERE period = :m AND kind = 'monthly'", ['m' => $month->toString()]);
        self::assertSame(Command::SUCCESS, $tester->execute(['--month' => $month->toString()]));

        self::assertEquals(16, $count);
        self::assertSame($count, $connection->fetchOne("SELECT COUNT(*) FROM billing_charge WHERE period = :m AND kind = 'monthly'", ['m' => $month->toString()]));
        self::assertStringContainsString($month->label(), $tester->getDisplay());
    }

    public function test_should_reject_a_malformed_month(): void
    {
        $tester = new CommandTester(new Application(self::bootKernel())->find('app:billing:generate-charges'));

        self::assertSame(Command::INVALID, $tester->execute(['--month' => 'marzo']));
    }
}

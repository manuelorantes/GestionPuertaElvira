<?php

declare(strict_types=1);

namespace App\Tests\Integration\Persistence;

use App\Infrastructure\Persistence\Doctrine\DoctrineTransactionRunner;
use Doctrine\DBAL\Connection;
use RuntimeException;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class DoctrineTransactionRunnerTest extends KernelTestCase
{
    public function test_should_commit_the_work_and_return_its_result(): void
    {
        [$runner, $connection] = $this->services();

        $result = $runner->run(static function () use ($connection): string {
            $connection->executeStatement("INSERT INTO cache_items (item_id, item_data, item_time) VALUES ('tx-ok', 'x', 0)");

            return 'hecho';
        });

        self::assertSame('hecho', $result);
        self::assertEquals(1, $connection->fetchOne("SELECT COUNT(*) FROM cache_items WHERE item_id = 'tx-ok'"));
    }

    public function test_should_undo_everything_when_the_work_fails(): void
    {
        [$runner, $connection] = $this->services();

        $failure = null;
        try {
            $runner->run(static function () use ($connection): void {
                $connection->executeStatement("INSERT INTO cache_items (item_id, item_data, item_time) VALUES ('tx-ko', 'x', 0)");

                throw new RuntimeException('falla a mitad');
            });
        } catch (RuntimeException $error) {
            $failure = $error->getMessage();
        }

        self::assertSame('falla a mitad', $failure);

        self::assertEquals(0, $connection->fetchOne("SELECT COUNT(*) FROM cache_items WHERE item_id = 'tx-ko'"));
    }

    /** @return array{DoctrineTransactionRunner, Connection} */
    private function services(): array
    {
        $container = self::getContainer();

        return [$container->get(DoctrineTransactionRunner::class), $container->get(Connection::class)];
    }
}

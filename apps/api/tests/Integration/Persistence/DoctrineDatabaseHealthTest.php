<?php

declare(strict_types=1);

namespace App\Tests\Integration\Persistence;

use App\Infrastructure\Persistence\Doctrine\DoctrineDatabaseHealth;
use Doctrine\DBAL\DriverManager;
use PDO;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class DoctrineDatabaseHealthTest extends KernelTestCase
{
    public function test_should_be_reachable_when_connected_to_the_test_database(): void
    {
        $health = self::getContainer()->get(DoctrineDatabaseHealth::class);

        self::assertTrue($health->isReachable());
    }

    public function test_should_be_unreachable_when_the_database_cannot_be_contacted(): void
    {
        $connection = DriverManager::getConnection([
            'driver' => 'pdo_pgsql',
            'host' => 'unreachable.invalid',
            'dbname' => 'club',
            'user' => 'club',
            'driverOptions' => [PDO::ATTR_TIMEOUT => 1],
        ]);

        self::assertFalse(new DoctrineDatabaseHealth($connection)->isReachable());
    }
}

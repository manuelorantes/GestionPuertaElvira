<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine;

use App\Application\Common\Port\TransactionRunner;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineTransactionRunner implements TransactionRunner
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function run(callable $work): mixed
    {
        return $this->em->wrapInTransaction(static fn (): mixed => $work());
    }
}

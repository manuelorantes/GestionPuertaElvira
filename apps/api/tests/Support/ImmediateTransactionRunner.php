<?php

declare(strict_types=1);

namespace App\Tests\Support;

use App\Application\Common\Port\TransactionRunner;

final class ImmediateTransactionRunner implements TransactionRunner
{
    public int $runs = 0;

    public function run(callable $work): mixed
    {
        ++$this->runs;

        return $work();
    }
}

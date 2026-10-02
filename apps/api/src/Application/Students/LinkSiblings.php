<?php

declare(strict_types=1);

namespace App\Application\Students;

use App\Application\Common\Port\TransactionRunner;
use App\Application\Students\Port\StudentRepository;

final readonly class LinkSiblings
{
    public function __construct(private StudentRepository $students, private TransactionRunner $transactions)
    {
    }

    public function __invoke(string $studentId, string $siblingId): void
    {
        $this->transactions->run(fn () => Siblings::link($this->students, $studentId, $siblingId));
    }
}

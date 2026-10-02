<?php

declare(strict_types=1);

namespace App\Application\Students;

use App\Application\Common\Port\TransactionRunner;
use App\Application\Students\Port\Enrolments;
use App\Application\Students\Port\StudentRepository;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;

final readonly class WithdrawStudent
{
    public function __construct(
        private StudentRepository $students,
        private Enrolments $enrolments,
        private TransactionRunner $transactions,
        private Clock $clock,
    ) {
    }

    /** Baja en una fecha (hoy o futura): desde ese día deja de ocupar plaza en todos sus grupos. */
    public function __invoke(string $id, string $date): void
    {
        $student = StudentLookup::byId($this->students, $id);
        $on = LocalDate::fromString($date);
        $student->withdraw($on, LocalDate::fromInstant($this->clock->now()));

        $this->transactions->run(function () use ($student, $on): void {
            $this->students->save($student);
            $this->enrolments->endAll($student->id(), $on);
        });
    }
}

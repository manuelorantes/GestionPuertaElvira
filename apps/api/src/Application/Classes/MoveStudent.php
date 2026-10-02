<?php

declare(strict_types=1);

namespace App\Application\Classes;

use App\Application\Classes\Error\NotEnrolled;
use App\Application\Classes\Port\ClassGroupRepository;
use App\Application\Classes\Port\EnrolmentRepository;
use App\Application\Common\Port\TransactionRunner;
use App\Domain\Classes\ClassGroupId;
use App\Domain\Classes\OverCapacity;
use App\Domain\Classes\StudentReference;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;

final readonly class MoveStudent
{
    public function __construct(
        private ClassGroupRepository $groups,
        private EnrolmentRepository $enrolments,
        private Clock $clock,
        private TransactionRunner $transactions,
    ) {
    }

    public function __invoke(string $studentId, string $fromGroupId, string $toGroupId, bool $confirmOverCapacity): void
    {
        $student = StudentReference::fromString($studentId);
        $from = ClassGroupId::fromString($fromGroupId);
        $today = LocalDate::fromInstant($this->clock->now());

        $this->transactions->run(function () use ($student, $from, $toGroupId, $today, $confirmOverCapacity): void {
            $current = $this->enrolments->activeForStudentInGroup($student, $from, $today) ?? throw new NotEnrolled();
            new Enrolling($this->groups, $this->enrolments)->enrol($student, ClassGroupId::fromString($toGroupId), $today, OverCapacity::fromConfirmation($confirmOverCapacity), ignoring: $from);
            $current->endOn($today);
            $this->enrolments->save($current);
        });
    }
}

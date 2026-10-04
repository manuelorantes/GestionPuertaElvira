<?php

declare(strict_types=1);

namespace App\Application\Classes;

use App\Application\Classes\Port\ClassGroupRepository;
use App\Application\Classes\Port\EnrolmentRepository;
use App\Domain\Classes\ClassGroupId;
use App\Domain\Classes\OverCapacity;
use App\Domain\Classes\StudentReference;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;

final readonly class EnrolStudent
{
    public function __construct(private ClassGroupRepository $groups, private EnrolmentRepository $enrolments, private Clock $clock)
    {
    }

    /** @param LocalDate|null $from inicio de la inscripción; por defecto hoy */
    public function __invoke(string $studentId, string $groupId, bool $confirmOverCapacity, ?LocalDate $from = null): void
    {
        new Enrolling($this->groups, $this->enrolments)->enrol(
            StudentReference::fromString($studentId),
            ClassGroupId::fromString($groupId),
            $from ?? LocalDate::fromInstant($this->clock->now()),
            OverCapacity::fromConfirmation($confirmOverCapacity),
        );
    }
}

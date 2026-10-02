<?php

declare(strict_types=1);

namespace App\Application\Classes;

use App\Application\Classes\Error\ClassGroupNotFound;
use App\Application\Classes\Port\ClassGroupRepository;
use App\Application\Classes\Port\EnrolmentRepository;
use App\Domain\Classes\ClassGroup;
use App\Domain\Classes\ClassGroupId;
use App\Domain\Classes\Enrolment;
use App\Domain\Classes\EnrolmentId;
use App\Domain\Classes\EnrolmentPolicy;
use App\Domain\Classes\OverCapacity;
use App\Domain\Classes\StudentReference;
use App\Domain\Common\LocalDate;

/**
 * Inscribe a un alumno aplicando EnrolmentPolicy; compartido por EnrolStudent y MoveStudent.
 */
final readonly class Enrolling
{
    public function __construct(private ClassGroupRepository $groups, private EnrolmentRepository $enrolments)
    {
    }

    public function enrol(StudentReference $student, ClassGroupId $groupId, LocalDate $on, OverCapacity $overCapacity, ?ClassGroupId $ignoring = null): void
    {
        $target = $this->groups->find($groupId) ?? throw new ClassGroupNotFound();
        $studentGroups = array_values(array_filter(
            array_map(fn (Enrolment $enrolment): ?ClassGroup => $this->groups->find($enrolment->group()), $this->enrolments->activeForStudent($student, $on)),
            static fn (?ClassGroup $group): bool => null !== $group && (null === $ignoring || !$group->id()->equals($ignoring)),
        ));

        new EnrolmentPolicy()->assertCanEnrol($target, $studentGroups, $this->enrolments->activeCount($groupId, $on), $overCapacity);

        $this->enrolments->save(Enrolment::start(EnrolmentId::generate(), $student, $groupId, $on));
    }
}

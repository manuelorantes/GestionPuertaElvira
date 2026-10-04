<?php

declare(strict_types=1);

namespace App\Application\Students;

use App\Application\Common\Port\TransactionRunner;
use App\Application\Students\Port\Enrolments;
use App\Application\Students\Port\StudentRepository;
use App\Domain\Common\Clock;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Students\Student;
use App\Domain\Students\StudentId;

final readonly class RegisterStudent
{
    public function __construct(
        private StudentRepository $students,
        private Enrolments $enrolments,
        private TransactionRunner $transactions,
        private Clock $clock,
    ) {
    }

    /**
     * Alta del alumno, inscripción en sus grupos y vínculo con sus hermanos, todo o nada.
     *
     * @param list<string> $groupIds
     * @param list<string> $siblingIds
     * @param string|null  $joinedOn   fecha de alta; por defecto hoy (una importación puede traer altas anteriores)
     */
    public function __invoke(StudentInput $input, array $groupIds, array $siblingIds, bool $confirmOverCapacity, ?string $joinedOn = null): string
    {
        if ([] === $groupIds) {
            throw new InvalidValue('groupIds', 'Elige al menos un grupo.');
        }

        $today = LocalDate::fromInstant($this->clock->now());
        $joined = null === $joinedOn ? $today : LocalDate::fromString($joinedOn);
        if ($today->isBefore($joined)) {
            throw new InvalidValue('joinedOn', 'La fecha de alta no puede ser futura.');
        }
        $student = Student::register(StudentId::generate(), $input->toDetails(), $today, $joined);

        return $this->transactions->run(function () use ($student, $groupIds, $siblingIds, $confirmOverCapacity, $joined): string {
            $this->students->save($student);
            $this->enrolments->enrol($student->id(), $groupIds, $confirmOverCapacity, $joined);
            foreach ($siblingIds as $siblingId) {
                Siblings::link($this->students, $student->id()->value, $siblingId);
            }

            return $student->id()->value;
        });
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Students;

use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;

/**
 * Alumno del club: datos personales, contacto, hermanos, alta y baja.
 */
final class Student
{
    /** @param array<string, StudentId> $siblings */
    private function __construct(
        private readonly StudentId $id,
        private StudentDetails $details,
        private readonly LocalDate $joinedOn,
        private ?LocalDate $withdrawnOn,
        private array $siblings,
    ) {
    }

    public static function register(StudentId $id, StudentDetails $details, LocalDate $today): self
    {
        new ContactPolicy()->assertAcceptable($details, $today);

        return new self($id, $details, $today, null, []);
    }

    /** @param list<StudentId> $siblings */
    public static function restore(StudentId $id, StudentDetails $details, LocalDate $joinedOn, ?LocalDate $withdrawnOn, array $siblings): self
    {
        $indexed = [];
        foreach ($siblings as $sibling) {
            $indexed[$sibling->value] = $sibling;
        }

        return new self($id, $details, $joinedOn, $withdrawnOn, $indexed);
    }

    public function updateDetails(StudentDetails $details, LocalDate $today): void
    {
        new ContactPolicy()->assertAcceptable($details, $today);
        $this->details = $details;
    }

    public function withdraw(LocalDate $on, LocalDate $today): void
    {
        if ($on->isBefore($this->joinedOn)) {
            throw new InvalidValue('date', 'La baja no puede ser anterior al alta en el club.');
        }
        if ($on->isBefore($today)) {
            throw new InvalidValue('date', 'La fecha de baja no puede ser anterior a hoy.');
        }

        $this->withdrawnOn = $on;
    }

    public function isActiveOn(LocalDate $day): bool
    {
        return null === $this->withdrawnOn || $day->isBefore($this->withdrawnOn);
    }

    public function addSibling(StudentId $sibling): void
    {
        if ($sibling->equals($this->id)) {
            throw new InvalidValue('siblingId', 'Un alumno no puede ser hermano de sí mismo.');
        }

        $this->siblings[$sibling->value] = $sibling;
    }

    public function removeSibling(StudentId $sibling): void
    {
        unset($this->siblings[$sibling->value]);
    }

    public function id(): StudentId
    {
        return $this->id;
    }

    public function details(): StudentDetails
    {
        return $this->details;
    }

    public function joinedOn(): LocalDate
    {
        return $this->joinedOn;
    }

    public function withdrawnOn(): ?LocalDate
    {
        return $this->withdrawnOn;
    }

    /** @return list<StudentId> */
    public function siblings(): array
    {
        return array_values($this->siblings);
    }
}

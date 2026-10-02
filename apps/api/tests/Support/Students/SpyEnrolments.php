<?php

declare(strict_types=1);

namespace App\Tests\Support\Students;

use App\Application\Students\Port\Enrolments;
use App\Domain\Common\LocalDate;
use App\Domain\Students\StudentId;
use Throwable;

final class SpyEnrolments implements Enrolments
{
    /** @var list<array{student: string, groups: list<string>, confirmed: bool}> */
    public array $enrolled = [];

    /** @var list<array{student: string, on: string}> */
    public array $ended = [];

    public ?Throwable $failWith = null;

    public function enrol(StudentId $student, array $groupIds, bool $confirmOverCapacity): void
    {
        if (null !== $this->failWith) {
            throw $this->failWith;
        }
        $this->enrolled[] = ['student' => $student->value, 'groups' => $groupIds, 'confirmed' => $confirmOverCapacity];
    }

    public function endAll(StudentId $student, LocalDate $on): void
    {
        $this->ended[] = ['student' => $student->value, 'on' => $on->toString()];
    }
}

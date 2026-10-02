<?php

declare(strict_types=1);

namespace App\Application\Students;

use App\Application\Students\Port\StudentRepository;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;

final readonly class UpdateStudent
{
    public function __construct(private StudentRepository $students, private Clock $clock)
    {
    }

    public function __invoke(string $id, StudentInput $input): void
    {
        $student = StudentLookup::byId($this->students, $id);
        $student->updateDetails($input->toDetails(), LocalDate::fromInstant($this->clock->now()));
        $this->students->save($student);
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Classes;

use App\Domain\Classes\Capacity;
use App\Domain\Classes\Classroom;
use App\Domain\Classes\GroupDetails;
use App\Domain\Classes\GroupName;
use App\Domain\Classes\HalfHour;
use App\Domain\Classes\Level;
use App\Domain\Classes\TeacherReference;
use App\Domain\Classes\Weekday;
use App\Domain\Classes\WeeklySlot;

/**
 * Datos de un grupo tal y como llegan del exterior; toDetails() los valida.
 */
final readonly class GroupInput
{
    /** @param list<string> $days */
    public function __construct(
        public string $name,
        public string $level,
        public string $teacherId,
        public array $days,
        public string $start,
        public string $end,
        public int $classroom,
        public int $capacity,
    ) {
    }

    public function toDetails(): GroupDetails
    {
        return new GroupDetails(
            GroupName::fromString($this->name),
            Level::fromName($this->level),
            TeacherReference::fromString($this->teacherId),
            WeeklySlot::of(
                array_map(Weekday::fromName(...), $this->days),
                HalfHour::fromString($this->start),
                HalfHour::fromString($this->end),
            ),
            Classroom::of($this->classroom),
            Capacity::of($this->capacity),
        );
    }
}

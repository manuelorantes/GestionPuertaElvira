<?php

declare(strict_types=1);

namespace App\Tests\Support\Classes;

use App\Domain\Classes\Capacity;
use App\Domain\Classes\ClassGroup;
use App\Domain\Classes\ClassGroupId;
use App\Domain\Classes\Classroom;
use App\Domain\Classes\GroupDetails;
use App\Domain\Classes\GroupName;
use App\Domain\Classes\HalfHour;
use App\Domain\Classes\Level;
use App\Domain\Classes\TeacherReference;
use App\Domain\Classes\Weekday;
use App\Domain\Classes\WeeklySlot;

final class GroupFactory
{
    /** @param list<Weekday> $days */
    public static function details(
        string $name = 'Iniciación A',
        array $days = [Weekday::Monday, Weekday::Wednesday],
        string $start = '17:00',
        string $end = '18:00',
        int $classroom = 1,
        int $capacity = 12,
        Level $level = Level::Beginner,
        ?TeacherReference $teacher = null,
    ): GroupDetails {
        return new GroupDetails(
            GroupName::fromString($name),
            $level,
            $teacher ?? TeacherReference::generate(),
            WeeklySlot::of($days, HalfHour::fromString($start), HalfHour::fromString($end)),
            Classroom::of($classroom),
            Capacity::of($capacity),
        );
    }

    /** @param list<Weekday> $days */
    public static function group(array $days = [Weekday::Monday, Weekday::Wednesday], string $start = '17:00', string $end = '18:00', int $classroom = 1, string $name = 'Iniciación A', int $capacity = 12): ClassGroup
    {
        return ClassGroup::create(ClassGroupId::generate(), self::details($name, $days, $start, $end, $classroom, $capacity));
    }
}

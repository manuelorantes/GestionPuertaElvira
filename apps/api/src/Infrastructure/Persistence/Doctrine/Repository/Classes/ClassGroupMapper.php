<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Classes;

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
use App\Infrastructure\Persistence\Doctrine\Model\Classes\ClassGroupRecord;

final readonly class ClassGroupMapper
{
    public static function toDomain(ClassGroupRecord $record): ClassGroup
    {
        return ClassGroup::restore(ClassGroupId::fromString($record->id), new GroupDetails(
            GroupName::fromString($record->name),
            Level::from($record->level),
            TeacherReference::fromString($record->teacherId),
            WeeklySlot::of(array_map(Weekday::from(...), $record->days), HalfHour::fromMinutes($record->startMinutes), HalfHour::fromMinutes($record->endMinutes)),
            Classroom::of($record->classroom),
            Capacity::of($record->capacity),
        ));
    }

    public static function toRecord(ClassGroup $group, ?ClassGroupRecord $record): ClassGroupRecord
    {
        $d = $group->details();
        $days = array_map(static fn (Weekday $day): int => $day->value, $d->slot->days());
        $record ??= new ClassGroupRecord($group->id()->value, $d->name->value, $d->level->value, $d->teacher->value, $days, $d->slot->start->minutes, $d->slot->end->minutes, $d->classroom->number, $d->capacity->value);
        $record->name = $d->name->value;
        $record->level = $d->level->value;
        $record->teacherId = $d->teacher->value;
        $record->days = $days;
        $record->startMinutes = $d->slot->start->minutes;
        $record->endMinutes = $d->slot->end->minutes;
        $record->classroom = $d->classroom->number;
        $record->capacity = $d->capacity->value;

        return $record;
    }
}

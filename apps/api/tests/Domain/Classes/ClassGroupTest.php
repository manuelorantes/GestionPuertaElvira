<?php

declare(strict_types=1);

namespace App\Tests\Domain\Classes;

use App\Domain\Classes\ClassroomSchedule;
use App\Domain\Classes\Level;
use App\Domain\Classes\Weekday;
use App\Domain\Classes\WeeklyPlan;
use App\Tests\Support\Classes\GroupFactory;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ClassGroupTest extends TestCase
{
    /** @param list<Weekday> $days */
    #[DataProvider('plans')]
    public function test_should_derive_the_weekly_plan_from_its_weekly_hours(array $days, string $start, string $end, Level $level, WeeklyPlan $expected): void
    {
        $details = GroupFactory::details(days: $days, start: $start, end: $end, level: $level);

        self::assertSame($expected, $details->weeklyPlan());
    }

    /** @return iterable<string, array{list<Weekday>, string, string, Level, WeeklyPlan}> */
    public static function plans(): iterable
    {
        yield 'one hour once' => [[Weekday::Friday], '16:30', '17:30', Level::Juniors, WeeklyPlan::OneHour];
        yield 'hour and a half once' => [[Weekday::Tuesday], '19:30', '21:00', Level::Adults, WeeklyPlan::HourAndHalf];
        yield 'one hour twice' => [[Weekday::Monday, Weekday::Wednesday], '17:00', '18:00', Level::Beginner, WeeklyPlan::TwoHours];
        yield 'hour and a half twice' => [[Weekday::Monday, Weekday::Wednesday], '18:00', '19:30', Level::Intermediate, WeeklyPlan::ThreeHours];
        yield 'private lesson' => [[Weekday::Thursday], '19:30', '21:00', Level::PrivateLesson, WeeklyPlan::PrivateLesson];
    }

    public function test_should_replace_its_details_when_updated(): void
    {
        $group = GroupFactory::group();

        $group->update(GroupFactory::details(name: 'Iniciación B', classroom: 2, capacity: 10));

        self::assertSame('Iniciación B', $group->details()->name->value);
        self::assertSame(2, $group->details()->classroom->number);
        self::assertSame(10, $group->details()->capacity->value);
    }

    public function test_should_find_groups_that_clash_in_the_same_classroom_only(): void
    {
        $sameRoomClash = GroupFactory::group(days: [Weekday::Monday], start: '17:30', end: '18:30', classroom: 1, name: 'Choca');
        $otherRoom = GroupFactory::group(days: [Weekday::Monday], start: '17:00', end: '18:00', classroom: 2, name: 'Otra aula');
        $backToBack = GroupFactory::group(days: [Weekday::Monday], start: '18:00', end: '19:00', classroom: 1, name: 'Seguido');
        $proposed = GroupFactory::group(days: [Weekday::Monday, Weekday::Wednesday], start: '17:00', end: '18:00', classroom: 1, name: 'Nuevo');

        $conflicts = new ClassroomSchedule()->conflictsFor($proposed->id(), $proposed->details(), [$sameRoomClash, $otherRoom, $backToBack, $proposed]);

        self::assertSame([$sameRoomClash], $conflicts);
    }
}

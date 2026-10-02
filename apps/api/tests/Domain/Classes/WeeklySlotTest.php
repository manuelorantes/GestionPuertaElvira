<?php

declare(strict_types=1);

namespace App\Tests\Domain\Classes;

use App\Domain\Classes\HalfHour;
use App\Domain\Classes\Weekday;
use App\Domain\Classes\WeeklySlot;
use App\Domain\Common\InvalidValue;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class WeeklySlotTest extends TestCase
{
    public function test_should_accept_half_hours_between_four_and_nine_pm(): void
    {
        self::assertSame('16:00', HalfHour::fromString('16:00')->toString());
        self::assertSame('21:00', HalfHour::fromString('21:00')->toString());
        self::assertSame('19:30', HalfHour::fromString('19:30')->toString());
    }

    #[DataProvider('invalidTimes')]
    public function test_should_reject_times_outside_the_club_hours_or_not_on_the_half_hour(string $time): void
    {
        $this->expectException(InvalidValue::class);

        HalfHour::fromString($time);
    }

    /** @return iterable<string, array{string}> */
    public static function invalidTimes(): iterable
    {
        yield 'too early' => ['15:30'];
        yield 'too late' => ['21:30'];
        yield 'quarter' => ['17:15'];
        yield 'malformed' => ['5pm'];
    }

    public function test_should_require_at_least_one_day_and_end_after_start(): void
    {
        $this->expectException(InvalidValue::class);
        $this->slot([], '17:00', '18:00');
    }

    public function test_should_reject_when_the_end_is_not_after_the_start(): void
    {
        $this->expectException(InvalidValue::class);
        $this->slot([Weekday::Monday], '18:00', '18:00');
    }

    public function test_should_sort_days_and_describe_itself(): void
    {
        $slot = $this->slot([Weekday::Wednesday, Weekday::Monday], '17:00', '18:30');

        self::assertSame([Weekday::Monday, Weekday::Wednesday], $slot->days());
        self::assertSame('Lun y Mié · 17:00–18:30', $slot->label());
        self::assertSame(3.0, $slot->weeklyHours());
    }

    /**
     * @param list<Weekday> $daysA
     * @param list<Weekday> $daysB
     */
    #[DataProvider('overlapCases')]
    public function test_should_overlap_only_when_sharing_a_day_and_intersecting_in_time(array $daysA, string $startA, string $endA, array $daysB, string $startB, string $endB, bool $expected): void
    {
        $a = $this->slot($daysA, $startA, $endA);
        $b = $this->slot($daysB, $startB, $endB);

        self::assertSame($expected, $a->overlaps($b));
        self::assertSame($expected, $b->overlaps($a));
    }

    /** @return iterable<string, array{list<Weekday>, string, string, list<Weekday>, string, string, bool}> */
    public static function overlapCases(): iterable
    {
        yield 'same day, intersecting' => [[Weekday::Monday], '17:00', '18:30', [Weekday::Monday], '18:00', '19:00', true];
        yield 'same day, back to back' => [[Weekday::Monday], '17:00', '18:00', [Weekday::Monday], '18:00', '19:00', false];
        yield 'different days' => [[Weekday::Monday], '17:00', '18:00', [Weekday::Tuesday], '17:00', '18:00', false];
        yield 'one shared day' => [[Weekday::Monday, Weekday::Wednesday], '17:00', '18:00', [Weekday::Wednesday, Weekday::Friday], '17:30', '18:30', true];
        yield 'contained' => [[Weekday::Friday], '16:00', '21:00', [Weekday::Friday], '18:00', '18:30', true];
    }

    /** @param list<Weekday> $days */
    private function slot(array $days, string $start, string $end): WeeklySlot
    {
        return WeeklySlot::of($days, HalfHour::fromString($start), HalfHour::fromString($end));
    }
}

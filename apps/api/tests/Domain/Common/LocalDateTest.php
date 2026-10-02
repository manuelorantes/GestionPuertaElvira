<?php

declare(strict_types=1);

namespace App\Tests\Domain\Common;

use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use DateTimeImmutable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class LocalDateTest extends TestCase
{
    public function test_should_parse_and_format_iso_dates(): void
    {
        self::assertSame('2026-10-02', LocalDate::fromString('2026-10-02')->toString());
    }

    #[DataProvider('invalidDates')]
    public function test_should_reject_when_the_date_does_not_exist_or_is_malformed(string $invalid): void
    {
        $this->expectException(InvalidValue::class);

        LocalDate::fromString($invalid);
    }

    /** @return iterable<string, array{string}> */
    public static function invalidDates(): iterable
    {
        yield 'february 30th' => ['2026-02-30'];
        yield 'spanish format' => ['02/10/2026'];
        yield 'with time' => ['2026-10-02 10:00'];
    }

    public function test_should_compare_chronologically(): void
    {
        $earlier = LocalDate::fromString('2026-09-30');
        $later = LocalDate::fromString('2026-10-02');

        self::assertTrue($earlier->isBefore($later));
        self::assertFalse($later->isBefore($earlier));
        self::assertTrue($later->isAfterOrEqual($later));
        self::assertTrue($earlier->equals(LocalDate::fromString('2026-09-30')));
    }

    public function test_should_compute_age_counting_birthdays_exactly(): void
    {
        $birth = LocalDate::fromString('2010-10-02');

        self::assertSame(15, $birth->ageOn(LocalDate::fromString('2026-10-01')));
        self::assertSame(16, $birth->ageOn(LocalDate::fromString('2026-10-02')));
    }

    public function test_should_take_the_calendar_day_of_an_instant_in_madrid(): void
    {
        $instant = new DateTimeImmutable('2026-10-01 23:30:00 UTC');

        self::assertSame('2026-10-02', LocalDate::fromInstant($instant)->toString());
    }
}

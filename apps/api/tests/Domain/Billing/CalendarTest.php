<?php

declare(strict_types=1);

namespace App\Tests\Domain\Billing;

use App\Domain\Billing\Season;
use App\Domain\Billing\YearMonth;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use PHPUnit\Framework\TestCase;

final class CalendarTest extends TestCase
{
    public function test_should_parse_navigate_and_compare_months(): void
    {
        $october = YearMonth::fromString('2026-10');

        self::assertSame('2026-11', $october->next()->toString());
        self::assertSame('2027-01', YearMonth::fromString('2026-12')->next()->toString());
        self::assertTrue($october->isBefore(YearMonth::fromString('2026-11')));
        self::assertSame(31, $october->days());
        self::assertSame('octubre 2026', $october->label());
        self::assertTrue(YearMonth::of(LocalDate::fromString('2026-10-02'))->equals($october));
        $this->expectException(InvalidValue::class);
        YearMonth::fromString('2026-13');
    }

    public function test_should_place_months_in_a_september_to_june_season(): void
    {
        $season = Season::containing(YearMonth::fromString('2027-02'));

        self::assertSame('2026/27', $season->label());
        self::assertSame('2026-09', $season->firstMonth()->toString());
        self::assertSame('2027-06', $season->lastMonth()->toString());
        self::assertSame(5, $season->monthsFrom(YearMonth::fromString('2027-02')));
        self::assertTrue($season->includes(YearMonth::fromString('2026-09')));
        self::assertFalse($season->includes(YearMonth::fromString('2027-07')));
        self::assertNull(Season::teachingSeason(YearMonth::fromString('2027-08')));
        self::assertSame('2026/27', Season::containing(YearMonth::fromString('2026-08'))->label(), 'el verano cuenta para la temporada que empieza');
    }
}

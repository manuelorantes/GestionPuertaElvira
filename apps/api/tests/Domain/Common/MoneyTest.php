<?php

declare(strict_types=1);

namespace App\Tests\Domain\Common;

use App\Domain\Common\InvalidValue;
use App\Domain\Common\Money;
use PHPUnit\Framework\TestCase;

final class MoneyTest extends TestCase
{
    public function test_should_add_multiply_and_compare_amounts_in_cents(): void
    {
        $fee = Money::euros(45);

        self::assertSame(4500, $fee->cents);
        self::assertTrue($fee->times(3)->equals(Money::cents(13500)));
        self::assertSame(5250, $fee->plus(Money::cents(750))->cents);
        self::assertSame(-750, Money::cents(4500)->minus(Money::cents(5250))->cents);
    }

    public function test_should_apply_percentages_rounding_half_up_to_cents(): void
    {
        self::assertSame(1238, Money::cents(12375)->percent(10)->cents);
        self::assertSame(12375, Money::cents(16500)->percent(75)->cents);
    }

    public function test_should_format_in_spanish_style(): void
    {
        self::assertSame('1.234,50 €', Money::cents(123450)->format());
        self::assertSame('45 €', Money::euros(45)->format());
        self::assertSame('−11,25 €', Money::cents(-1125)->format());
    }

    public function test_should_parse_decimal_strings(): void
    {
        self::assertSame(3050, Money::fromDecimal('30,50')->cents);
        self::assertSame(3000, Money::fromDecimal('30')->cents);
        $this->expectException(InvalidValue::class);
        Money::fromDecimal('treinta');
    }
}

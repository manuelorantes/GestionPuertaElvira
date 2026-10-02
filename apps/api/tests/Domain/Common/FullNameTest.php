<?php

declare(strict_types=1);

namespace App\Tests\Domain\Common;

use App\Domain\Common\FullName;
use App\Domain\Common\InvalidValue;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class FullNameTest extends TestCase
{
    public function test_should_collapse_inner_and_trim_outer_spaces_when_created(): void
    {
        self::assertSame('Lucía Moreno Gil', FullName::fromString('  Lucía   Moreno Gil ')->value);
    }

    #[DataProvider('invalidNames')]
    public function test_should_reject_when_the_length_is_out_of_bounds(string $invalid): void
    {
        $this->expectException(InvalidValue::class);

        FullName::fromString($invalid);
    }

    /** @return iterable<string, array{string}> */
    public static function invalidNames(): iterable
    {
        yield 'blank' => ['   '];
        yield 'one character' => ['L'];
        yield 'too long' => [str_repeat('a', 121)];
    }
}

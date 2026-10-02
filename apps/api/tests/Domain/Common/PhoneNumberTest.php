<?php

declare(strict_types=1);

namespace App\Tests\Domain\Common;

use App\Domain\Common\InvalidValue;
use App\Domain\Common\PhoneNumber;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class PhoneNumberTest extends TestCase
{
    #[DataProvider('validPhones')]
    public function test_should_normalise_spanish_numbers(string $input): void
    {
        self::assertSame('612 48 19 30', PhoneNumber::fromString($input)->value);
    }

    /** @return iterable<string, array{string}> */
    public static function validPhones(): iterable
    {
        yield 'digits' => ['612481930'];
        yield 'spaced' => ['612 48 19 30'];
        yield 'dashed with prefix' => ['+34 612-481-930'];
        yield 'international zeros' => ['0034612481930'];
    }

    #[DataProvider('invalidPhones')]
    public function test_should_reject_when_it_is_not_a_spanish_number(string $invalid): void
    {
        $this->expectException(InvalidValue::class);

        PhoneNumber::fromString($invalid);
    }

    /** @return iterable<string, array{string}> */
    public static function invalidPhones(): iterable
    {
        yield 'too short' => ['61248193'];
        yield 'letters' => ['612 48 19 3a'];
        yield 'foreign prefix' => ['+44 7700 900123'];
        yield 'starts with 1' => ['112481930'];
    }
}

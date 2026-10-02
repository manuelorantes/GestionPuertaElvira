<?php

declare(strict_types=1);

namespace App\Tests\Domain\Students;

use App\Domain\Common\InvalidValue;
use App\Domain\Students\FederationLicence;
use App\Domain\Students\NationalId;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class StudentValuesTest extends TestCase
{
    #[DataProvider('validIds')]
    public function test_should_accept_dni_and_nie_with_a_correct_check_letter(string $input, string $normalised): void
    {
        self::assertSame($normalised, NationalId::fromString($input)->value);
    }

    /** @return iterable<string, array{string, string}> */
    public static function validIds(): iterable
    {
        yield 'dni' => ['12345678Z', '12345678Z'];
        yield 'dni lowercase with dash' => ['12345678-z', '12345678Z'];
        yield 'nie' => ['X1234567L', 'X1234567L'];
    }

    #[DataProvider('invalidIds')]
    public function test_should_reject_identifiers_with_a_wrong_letter_or_format(string $input): void
    {
        $this->expectException(InvalidValue::class);

        NationalId::fromString($input);
    }

    /** @return iterable<string, array{string}> */
    public static function invalidIds(): iterable
    {
        yield 'wrong letter' => ['12345678A'];
        yield 'too short' => ['1234567Z'];
        yield 'nie wrong prefix' => ['A1234567L'];
    }

    public function test_should_validate_federation_licences(): void
    {
        self::assertSame('AND-20417', FederationLicence::fromString(' and-20417 ')->value);
        $this->expectException(InvalidValue::class);
        FederationLicence::fromString('X');
    }
}

<?php

declare(strict_types=1);

namespace App\Tests\Domain\Common;

use App\Domain\Common\EmailAddress;
use App\Domain\Common\InvalidValue;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class EmailAddressTest extends TestCase
{
    public function test_should_normalise_case_and_surrounding_spaces_when_created(): void
    {
        $email = EmailAddress::fromString('  Junta@PuertaElvira.ES ');

        self::assertSame('junta@puertaelvira.es', $email->value);
    }

    public function test_should_be_equal_when_values_match_after_normalisation(): void
    {
        self::assertTrue(EmailAddress::fromString('A@b.es')->equals(EmailAddress::fromString('a@B.es')));
    }

    #[DataProvider('invalidEmails')]
    public function test_should_reject_when_the_format_is_invalid(string $invalid): void
    {
        $this->expectException(InvalidValue::class);

        EmailAddress::fromString($invalid);
    }

    /** @return iterable<string, array{string}> */
    public static function invalidEmails(): iterable
    {
        yield 'empty' => [''];
        yield 'no at' => ['junta.puertaelvira.es'];
        yield 'no domain' => ['junta@'];
        yield 'spaces inside' => ['ju nta@club.es'];
        yield 'too long' => [str_repeat('a', 250).'@club.es'];
    }
}

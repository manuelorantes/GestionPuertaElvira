<?php

declare(strict_types=1);

namespace App\Tests\Domain\Common;

use App\Domain\Common\InvalidValue;
use App\Domain\Identity\UserId;
use PHPUnit\Framework\TestCase;

final class UuidTest extends TestCase
{
    public function test_should_generate_a_version_seven_rfc_identifier(): void
    {
        self::assertMatchesRegularExpression('/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', UserId::generate()->value);
    }

    public function test_should_sort_by_creation_time_when_generated_in_sequence(): void
    {
        $first = UserId::generate();
        usleep(2000);

        self::assertLessThan(UserId::generate()->value, $first->value);
    }

    public function test_should_round_trip_and_compare_when_parsed_from_a_string(): void
    {
        $id = UserId::generate();

        self::assertTrue(UserId::fromString(strtoupper($id->value))->equals($id));
        self::assertSame($id->value, (string) $id);
    }

    public function test_should_reject_when_the_string_is_not_a_uuid(): void
    {
        $this->expectException(InvalidValue::class);

        UserId::fromString('not-a-uuid');
    }
}

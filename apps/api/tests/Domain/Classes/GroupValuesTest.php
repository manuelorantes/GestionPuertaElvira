<?php

declare(strict_types=1);

namespace App\Tests\Domain\Classes;

use App\Domain\Classes\Capacity;
use App\Domain\Classes\Classroom;
use App\Domain\Classes\GroupName;
use App\Domain\Classes\Level;
use App\Domain\Common\InvalidValue;
use PHPUnit\Framework\TestCase;

final class GroupValuesTest extends TestCase
{
    public function test_should_accept_capacity_between_one_and_thirty(): void
    {
        self::assertSame(1, Capacity::of(1)->value);
        self::assertSame(30, Capacity::of(30)->value);
    }

    public function test_should_reject_capacity_out_of_bounds(): void
    {
        $this->expectException(InvalidValue::class);
        Capacity::of(31);
    }

    public function test_should_only_have_classrooms_one_and_two(): void
    {
        self::assertSame(2, Classroom::of(2)->number);
        $this->expectException(InvalidValue::class);
        Classroom::of(3);
    }

    public function test_should_validate_group_names(): void
    {
        self::assertSame('Iniciación A', GroupName::fromString('  Iniciación   A ')->value);
        $this->expectException(InvalidValue::class);
        GroupName::fromString('X');
    }

    public function test_should_parse_levels_by_name(): void
    {
        self::assertSame(Level::PrivateLesson, Level::fromName('private_lesson'));
        $this->expectException(InvalidValue::class);
        Level::fromName('expert');
    }
}

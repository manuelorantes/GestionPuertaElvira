<?php

declare(strict_types=1);

namespace App\Tests\Domain\Teachers;

use App\Domain\Common\FullName;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\Money;
use App\Domain\Teachers\Teacher;
use App\Domain\Teachers\TeacherId;
use PHPUnit\Framework\TestCase;

final class TeacherTest extends TestCase
{
    public function test_should_be_active_when_registered_and_follow_status_changes(): void
    {
        $teacher = Teacher::register(TeacherId::generate(), FullName::fromString('Lucía Moreno Gil'));

        self::assertTrue($teacher->isActive());
        $teacher->deactivate();
        self::assertFalse($teacher->isActive());
        $teacher->activate();
        self::assertTrue($teacher->isActive());
    }

    public function test_should_be_paid_fifteen_euros_an_hour_until_the_rate_changes(): void
    {
        $teacher = Teacher::register(TeacherId::generate(), FullName::fromString('Lucía Moreno Gil'));
        self::assertSame(1500, $teacher->hourlyRate()->cents);

        $teacher->changeRate(Money::euros(18));
        self::assertSame(1800, $teacher->hourlyRate()->cents);

        $this->expectException(InvalidValue::class);
        $teacher->changeRate(Money::cents(-1));
    }

    public function test_should_change_the_name_when_renamed(): void
    {
        $teacher = Teacher::register(TeacherId::generate(), FullName::fromString('Lucía Moreno Gil'));

        $teacher->rename(FullName::fromString('Lucía Moreno Gil de la Torre'));

        self::assertSame('Lucía Moreno Gil de la Torre', $teacher->fullName()->value);
    }
}

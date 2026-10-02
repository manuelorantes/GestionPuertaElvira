<?php

declare(strict_types=1);

namespace App\Tests\Domain\Identity;

use App\Domain\Common\InvalidValue;
use App\Domain\Identity\PlainPassword;
use PHPUnit\Framework\TestCase;

final class PlainPasswordTest extends TestCase
{
    public function test_should_never_reveal_the_secret_when_printed_or_dumped(): void
    {
        $password = PlainPassword::fromString('dama-de-negras');

        self::assertSame('[oculta]', (string) $password);
        self::assertStringNotContainsString('dama-de-negras', print_r($password, true));
        self::assertSame('dama-de-negras', $password->reveal());
    }

    public function test_should_reject_when_the_password_exceeds_the_maximum_length(): void
    {
        $this->expectException(InvalidValue::class);

        PlainPassword::fromString(str_repeat('x', 4097));
    }
}

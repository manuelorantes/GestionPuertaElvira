<?php

declare(strict_types=1);

namespace App\Tests\Domain\Identity;

use App\Domain\Common\InvalidValue;
use App\Domain\Identity\Role;
use PHPUnit\Framework\TestCase;

final class RoleTest extends TestCase
{
    public function test_should_parse_known_roles_when_given_their_names(): void
    {
        self::assertSame(Role::Superadministrator, Role::fromName('superadministrator'));
        self::assertSame(Role::Administrator, Role::fromName('administrator'));
        self::assertSame(Role::Teacher, Role::fromName('teacher'));
    }

    public function test_should_reject_when_the_role_is_unknown(): void
    {
        $this->expectException(InvalidValue::class);

        Role::fromName('superuser');
    }
}

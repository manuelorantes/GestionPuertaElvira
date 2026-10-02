<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Mapper\Identity;

use App\Domain\Common\EmailAddress;
use App\Domain\Common\FullName;
use App\Domain\Identity\AccountStatus;
use App\Domain\Identity\PasswordHash;
use App\Domain\Identity\Role;
use App\Domain\Identity\User;
use App\Domain\Identity\UserId;
use App\Infrastructure\Persistence\Doctrine\Model\Identity\UserRecord;

final readonly class UserMapper
{
    public static function toDomain(UserRecord $record): User
    {
        return User::restore(
            UserId::fromString($record->id),
            EmailAddress::fromString($record->email),
            FullName::fromString($record->fullName),
            Role::from($record->role),
            new PasswordHash($record->passwordHash),
            AccountStatus::from($record->status),
            $record->mustChangePassword,
            $record->createdAt,
            $record->passwordChangedAt,
        );
    }

    public static function toRecord(User $user, ?UserRecord $record = null): UserRecord
    {
        if (null === $record) {
            return new UserRecord(
                $user->id()->value,
                $user->email()->value,
                $user->fullName()->value,
                $user->role()->value,
                $user->passwordHash()->value,
                $user->status()->value,
                $user->mustChangePassword(),
                $user->createdAt(),
                $user->passwordChangedAt(),
            );
        }

        $record->email = $user->email()->value;
        $record->fullName = $user->fullName()->value;
        $record->role = $user->role()->value;
        $record->passwordHash = $user->passwordHash()->value;
        $record->status = $user->status()->value;
        $record->mustChangePassword = $user->mustChangePassword();
        $record->passwordChangedAt = $user->passwordChangedAt();

        return $record;
    }
}

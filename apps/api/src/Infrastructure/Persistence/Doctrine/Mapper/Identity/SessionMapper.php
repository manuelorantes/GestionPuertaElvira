<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Mapper\Identity;

use App\Domain\Identity\Session;
use App\Domain\Identity\SessionId;
use App\Domain\Identity\SessionTokenHash;
use App\Domain\Identity\UserId;
use App\Infrastructure\Persistence\Doctrine\Model\Identity\SessionRecord;

final readonly class SessionMapper
{
    public static function toDomain(SessionRecord $record): Session
    {
        return Session::restore(
            SessionId::fromString($record->id),
            new SessionTokenHash($record->tokenHash),
            UserId::fromString($record->userId),
            $record->startedAt,
            $record->lastActivityAt,
        );
    }

    public static function toRecord(Session $session, ?SessionRecord $record = null): SessionRecord
    {
        if (null === $record) {
            return new SessionRecord(
                $session->id()->value,
                $session->tokenHash()->value,
                $session->userId()->value,
                $session->startedAt(),
                $session->lastActivityAt(),
            );
        }

        $record->lastActivityAt = $session->lastActivityAt();

        return $record;
    }
}

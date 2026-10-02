<?php

declare(strict_types=1);

namespace App\Application\Identity;

use App\Application\Identity\Error\CurrentPasswordMismatch;
use App\Application\Identity\Error\SessionNotValid;
use App\Application\Identity\Port\PasswordHasher;
use App\Application\Identity\Port\SecurityEventLog;
use App\Application\Identity\Port\SessionRepository;
use App\Application\Identity\Port\UserRepository;
use App\Domain\Common\Clock;
use App\Domain\Identity\Error\WeakPassword;
use App\Domain\Identity\PasswordPolicy;
use App\Domain\Identity\PlainPassword;
use App\Domain\Identity\SessionId;
use App\Domain\Identity\UserId;
use SensitiveParameter;

final readonly class ChangeOwnPassword
{
    public function __construct(
        private UserRepository $users,
        private SessionRepository $sessions,
        private PasswordHasher $hasher,
        private SecurityEventLog $log,
        private Clock $clock,
    ) {
    }

    /**
     * @throws CurrentPasswordMismatch
     * @throws WeakPassword
     */
    public function __invoke(
        string $userId,
        string $currentSessionId,
        #[SensitiveParameter]
        string $currentPassword,
        #[SensitiveParameter]
        string $newPassword,
    ): void {
        $user = $this->users->find(UserId::fromString($userId)) ?? throw new SessionNotValid();

        if (!$this->hasher->verify($user->passwordHash(), PlainPassword::fromString($currentPassword))) {
            $this->log->record('password_change', 'failure', $user->id());

            throw new CurrentPasswordMismatch();
        }

        $new = PlainPassword::fromString($newPassword);
        new PasswordPolicy()->assertAcceptable($new, $user->email());

        $user->changePassword($this->hasher->hash($new), $this->clock->now());
        $this->users->save($user);
        $this->sessions->removeAllForUser($user->id(), except: SessionId::fromString($currentSessionId));
        $this->log->record('password_change', 'success', $user->id());
    }
}

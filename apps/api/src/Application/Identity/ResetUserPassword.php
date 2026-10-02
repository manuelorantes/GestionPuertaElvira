<?php

declare(strict_types=1);

namespace App\Application\Identity;

use App\Application\Identity\Port\PasswordHasher;
use App\Application\Identity\Port\SecurityEventLog;
use App\Application\Identity\Port\SessionRepository;
use App\Application\Identity\Port\TemporaryPasswordGenerator;
use App\Application\Identity\Port\UserRepository;
use App\Domain\Common\Clock;

final readonly class ResetUserPassword
{
    public function __construct(
        private UserRepository $users,
        private SessionRepository $sessions,
        private PasswordHasher $hasher,
        private TemporaryPasswordGenerator $temporaryPasswords,
        private SecurityEventLog $log,
        private Clock $clock,
    ) {
    }

    /**
     * Asigna una contraseña temporal (que hay que cambiar al entrar) y cierra todas las sesiones.
     */
    public function __invoke(string $email): string
    {
        $user = UserLookup::byEmail($this->users, $email);
        $temporary = $this->temporaryPasswords->generate();
        $user->resetPassword($this->hasher->hash($temporary), $this->clock->now());
        $this->users->save($user);
        $this->sessions->removeAllForUser($user->id());
        $this->log->record('password_reset', 'success', $user->id());

        return $temporary->reveal();
    }
}

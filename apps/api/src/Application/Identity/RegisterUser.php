<?php

declare(strict_types=1);

namespace App\Application\Identity;

use App\Application\Identity\Error\EmailAlreadyRegistered;
use App\Application\Identity\Port\PasswordHasher;
use App\Application\Identity\Port\SecurityEventLog;
use App\Application\Identity\Port\TemporaryPasswordGenerator;
use App\Application\Identity\Port\UserRepository;
use App\Domain\Common\Clock;
use App\Domain\Identity\EmailAddress;
use App\Domain\Identity\FullName;
use App\Domain\Identity\Role;
use App\Domain\Identity\User;
use App\Domain\Identity\UserId;

final readonly class RegisterUser
{
    public function __construct(
        private UserRepository $users,
        private PasswordHasher $hasher,
        private TemporaryPasswordGenerator $temporaryPasswords,
        private SecurityEventLog $log,
        private Clock $clock,
    ) {
    }

    /**
     * Da de alta una cuenta y devuelve su contraseña temporal, que solo se muestra esta vez.
     *
     * @throws EmailAlreadyRegistered
     */
    public function __invoke(string $email, string $fullName, string $role): string
    {
        $address = EmailAddress::fromString($email);
        if (null !== $this->users->findByEmail($address)) {
            throw new EmailAlreadyRegistered();
        }

        $temporary = $this->temporaryPasswords->generate();
        $user = User::register(UserId::generate(), $address, FullName::fromString($fullName), Role::fromName($role), $this->hasher->hash($temporary), $this->clock->now());
        $this->users->save($user);
        $this->log->record('user_registered', 'success', $user->id());

        return $temporary->reveal();
    }
}

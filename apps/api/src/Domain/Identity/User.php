<?php

declare(strict_types=1);

namespace App\Domain\Identity;

use App\Domain\Common\RecordsEvents;
use App\Domain\Identity\Event\UserDisabled;
use App\Domain\Identity\Event\UserPasswordChanged;
use App\Domain\Identity\Event\UserPasswordReset;
use App\Domain\Identity\Event\UserRegistered;
use DateTimeImmutable;

/**
 * Cuenta de una persona con acceso al panel.
 */
final class User
{
    use RecordsEvents;

    private function __construct(
        private readonly UserId $id,
        private readonly EmailAddress $email,
        private readonly FullName $fullName,
        private Role $role,
        private PasswordHash $passwordHash,
        private AccountStatus $status,
        private bool $mustChangePassword,
        private readonly DateTimeImmutable $createdAt,
        private DateTimeImmutable $passwordChangedAt,
    ) {
    }

    /**
     * Toda cuenta nace con una contraseña temporal que hay que cambiar al entrar.
     */
    public static function register(
        UserId $id,
        EmailAddress $email,
        FullName $fullName,
        Role $role,
        PasswordHash $temporaryPassword,
        DateTimeImmutable $now,
    ): self {
        $user = new self($id, $email, $fullName, $role, $temporaryPassword, AccountStatus::Active, true, $now, $now);
        $user->record(new UserRegistered($id, $role));

        return $user;
    }

    /**
     * Reconstruye una cuenta ya existente desde la persistencia, sin registrar eventos.
     */
    public static function restore(
        UserId $id,
        EmailAddress $email,
        FullName $fullName,
        Role $role,
        PasswordHash $passwordHash,
        AccountStatus $status,
        bool $mustChangePassword,
        DateTimeImmutable $createdAt,
        DateTimeImmutable $passwordChangedAt,
    ): self {
        return new self($id, $email, $fullName, $role, $passwordHash, $status, $mustChangePassword, $createdAt, $passwordChangedAt);
    }

    public function changePassword(PasswordHash $newPassword, DateTimeImmutable $now): void
    {
        $this->passwordHash = $newPassword;
        $this->mustChangePassword = false;
        $this->passwordChangedAt = $now;
        $this->record(new UserPasswordChanged($this->id));
    }

    public function resetPassword(PasswordHash $temporaryPassword, DateTimeImmutable $now): void
    {
        $this->passwordHash = $temporaryPassword;
        $this->mustChangePassword = true;
        $this->passwordChangedAt = $now;
        $this->record(new UserPasswordReset($this->id));
    }

    /**
     * Sustituye el hash por otro equivalente (p. ej. con un algoritmo más robusto) sin más efectos.
     */
    public function upgradePasswordHash(PasswordHash $rehashed): void
    {
        $this->passwordHash = $rehashed;
    }

    public function disable(): void
    {
        $this->status = AccountStatus::Disabled;
        $this->record(new UserDisabled($this->id));
    }

    public function enable(): void
    {
        $this->status = AccountStatus::Active;
    }

    public function changeRole(Role $role): void
    {
        $this->role = $role;
    }

    public function canAuthenticate(): bool
    {
        return AccountStatus::Active === $this->status;
    }

    public function id(): UserId
    {
        return $this->id;
    }

    public function email(): EmailAddress
    {
        return $this->email;
    }

    public function fullName(): FullName
    {
        return $this->fullName;
    }

    public function role(): Role
    {
        return $this->role;
    }

    public function passwordHash(): PasswordHash
    {
        return $this->passwordHash;
    }

    public function status(): AccountStatus
    {
        return $this->status;
    }

    public function mustChangePassword(): bool
    {
        return $this->mustChangePassword;
    }

    public function createdAt(): DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function passwordChangedAt(): DateTimeImmutable
    {
        return $this->passwordChangedAt;
    }
}

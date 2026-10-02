<?php

declare(strict_types=1);

namespace App\Domain\Teachers;

use App\Domain\Common\FullName;

/**
 * Profesor del club. La especificación de Profesorado añadirá tarifa y horas.
 */
final class Teacher
{
    private function __construct(
        private readonly TeacherId $id,
        private FullName $fullName,
        private bool $active,
    ) {
    }

    public static function register(TeacherId $id, FullName $fullName): self
    {
        return new self($id, $fullName, true);
    }

    public static function restore(TeacherId $id, FullName $fullName, bool $active): self
    {
        return new self($id, $fullName, $active);
    }

    public function rename(FullName $fullName): void
    {
        $this->fullName = $fullName;
    }

    public function activate(): void
    {
        $this->active = true;
    }

    public function deactivate(): void
    {
        $this->active = false;
    }

    public function id(): TeacherId
    {
        return $this->id;
    }

    public function fullName(): FullName
    {
        return $this->fullName;
    }

    public function isActive(): bool
    {
        return $this->active;
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Classes;

/**
 * Grupo de clase: nivel, profesor, franja semanal, aula y plazas.
 */
final class ClassGroup
{
    private function __construct(private readonly ClassGroupId $id, private GroupDetails $details)
    {
    }

    public static function create(ClassGroupId $id, GroupDetails $details): self
    {
        return new self($id, $details);
    }

    public static function restore(ClassGroupId $id, GroupDetails $details): self
    {
        return new self($id, $details);
    }

    public function update(GroupDetails $details): void
    {
        $this->details = $details;
    }

    public function id(): ClassGroupId
    {
        return $this->id;
    }

    public function details(): GroupDetails
    {
        return $this->details;
    }
}

<?php

declare(strict_types=1);

namespace App\Tests\Support\Classes;

use App\Application\Classes\Port\ClassGroupRepository;
use App\Domain\Classes\ClassGroup;
use App\Domain\Classes\ClassGroupId;

final class InMemoryClassGroupRepository implements ClassGroupRepository
{
    /** @var array<string, ClassGroup> */
    public array $groups = [];

    public function find(ClassGroupId $id): ?ClassGroup
    {
        return $this->groups[$id->value] ?? null;
    }

    public function all(): array
    {
        return array_values($this->groups);
    }

    public function save(ClassGroup $group): void
    {
        $this->groups[$group->id()->value] = $group;
    }
}

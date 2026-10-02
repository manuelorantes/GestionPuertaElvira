<?php

declare(strict_types=1);

namespace App\Application\Classes\Port;

use App\Domain\Classes\ClassGroup;
use App\Domain\Classes\ClassGroupId;

interface ClassGroupRepository
{
    public function find(ClassGroupId $id): ?ClassGroup;

    /** @return list<ClassGroup> */
    public function all(): array;

    public function save(ClassGroup $group): void;
}

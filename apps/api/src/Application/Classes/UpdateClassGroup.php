<?php

declare(strict_types=1);

namespace App\Application\Classes;

use App\Application\Classes\Error\ClassGroupNotFound;
use App\Application\Classes\Port\ClassGroupRepository;
use App\Application\Classes\Port\TeacherDirectory;
use App\Domain\Classes\ClassGroupId;

final readonly class UpdateClassGroup
{
    public function __construct(private ClassGroupRepository $groups, private TeacherDirectory $teachers)
    {
    }

    public function __invoke(string $id, GroupInput $input): void
    {
        $group = $this->groups->find(ClassGroupId::fromString($id)) ?? throw new ClassGroupNotFound();
        $details = $input->toDetails();
        new GroupDetailsGuard($this->groups, $this->teachers)->assertAcceptable($group->id(), $details);

        $group->update($details);
        $this->groups->save($group);
    }
}

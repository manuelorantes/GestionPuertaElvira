<?php

declare(strict_types=1);

namespace App\Application\Classes;

use App\Application\Classes\Port\ClassGroupRepository;
use App\Application\Classes\Port\TeacherDirectory;
use App\Domain\Classes\ClassGroup;
use App\Domain\Classes\ClassGroupId;

final readonly class CreateClassGroup
{
    public function __construct(private ClassGroupRepository $groups, private TeacherDirectory $teachers)
    {
    }

    public function __invoke(GroupInput $input): string
    {
        $id = ClassGroupId::generate();
        $details = $input->toDetails();
        new GroupDetailsGuard($this->groups, $this->teachers)->assertAcceptable($id, $details);

        $this->groups->save(ClassGroup::create($id, $details));

        return $id->value;
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Teachers;

use App\Application\Teachers\Port\TeacherRepository;
use App\Domain\Common\FullName;

final readonly class RenameTeacher
{
    public function __construct(private TeacherRepository $teachers)
    {
    }

    public function __invoke(string $id, string $fullName): void
    {
        $teacher = TeacherLookup::byId($this->teachers, $id);
        $teacher->rename(FullName::fromString($fullName));
        $this->teachers->save($teacher);
    }
}

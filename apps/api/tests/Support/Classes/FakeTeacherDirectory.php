<?php

declare(strict_types=1);

namespace App\Tests\Support\Classes;

use App\Application\Classes\Port\TeacherDirectory;
use App\Domain\Classes\TeacherReference;

final class FakeTeacherDirectory implements TeacherDirectory
{
    /** @var array<string, bool> */
    public array $active = [];

    public function isActive(TeacherReference $teacher): bool
    {
        return $this->active[$teacher->value] ?? false;
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Teachers;

use App\Application\Teachers\Port\TeacherRepository;
use App\Domain\Common\FullName;
use App\Domain\Teachers\Teacher;
use App\Domain\Teachers\TeacherId;

final readonly class RegisterTeacher
{
    public function __construct(private TeacherRepository $teachers)
    {
    }

    public function __invoke(string $fullName): string
    {
        $teacher = Teacher::register(TeacherId::generate(), FullName::fromString($fullName));
        $this->teachers->save($teacher);

        return $teacher->id()->value;
    }
}

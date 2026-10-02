<?php

declare(strict_types=1);

namespace App\Tests\Application\Teachers;

use App\Application\Teachers\ActivateTeacher;
use App\Application\Teachers\DeactivateTeacher;
use App\Application\Teachers\Error\TeacherHasGroups;
use App\Application\Teachers\Error\TeacherNotFound;
use App\Application\Teachers\Port\TeacherAssignments;
use App\Application\Teachers\RegisterTeacher;
use App\Application\Teachers\RenameTeacher;
use App\Domain\Teachers\TeacherId;
use App\Tests\Support\Teachers\InMemoryTeacherRepository;
use PHPUnit\Framework\TestCase;

final class TeacherManagementTest extends TestCase
{
    private InMemoryTeacherRepository $teachers;

    protected function setUp(): void
    {
        $this->teachers = new InMemoryTeacherRepository();
    }

    public function test_should_register_an_active_teacher_and_return_its_id(): void
    {
        $id = new RegisterTeacher($this->teachers)('  Carlos   Ruiz Márquez ');

        $teacher = $this->teachers->find(TeacherId::fromString($id));
        self::assertSame('Carlos Ruiz Márquez', $teacher?->fullName()->value);
        self::assertTrue($teacher->isActive());
    }

    public function test_should_rename_an_existing_teacher(): void
    {
        $id = new RegisterTeacher($this->teachers)('Carlos Ruiz');

        new RenameTeacher($this->teachers)($id, 'Carlos Ruiz Márquez');

        self::assertSame('Carlos Ruiz Márquez', $this->teachers->find(TeacherId::fromString($id))?->fullName()->value);
    }

    public function test_should_deactivate_a_teacher_without_groups_and_activate_again(): void
    {
        $id = new RegisterTeacher($this->teachers)('Carlos Ruiz');
        new DeactivateTeacher($this->teachers, $this->assignments(0))($id);
        self::assertFalse($this->teachers->find(TeacherId::fromString($id))?->isActive());

        new ActivateTeacher($this->teachers)($id);
        self::assertTrue($this->teachers->find(TeacherId::fromString($id))->isActive());
    }

    public function test_should_refuse_to_deactivate_a_teacher_who_still_has_groups(): void
    {
        $id = new RegisterTeacher($this->teachers)('Carlos Ruiz');

        $this->expectExceptionObject(new TeacherHasGroups(3));

        new DeactivateTeacher($this->teachers, $this->assignments(3))($id);
    }

    public function test_should_fail_clearly_when_the_teacher_does_not_exist(): void
    {
        $this->expectException(TeacherNotFound::class);

        new RenameTeacher($this->teachers)(TeacherId::generate()->value, 'Nadie');
    }

    private function assignments(int $groups): TeacherAssignments
    {
        return new readonly class($groups) implements TeacherAssignments {
            public function __construct(private int $groups)
            {
            }

            public function groupCount(TeacherId $teacherId): int
            {
                return $this->groups;
            }
        };
    }
}

<?php

declare(strict_types=1);

namespace App\Tests\Application\Classes;

use App\Application\Classes\CreateClassGroup;
use App\Application\Classes\Error\ClassGroupNotFound;
use App\Application\Classes\Error\ClassroomConflict;
use App\Application\Classes\Error\TeacherNotAvailable;
use App\Application\Classes\GroupInput;
use App\Application\Classes\UpdateClassGroup;
use App\Domain\Classes\ClassGroupId;
use App\Domain\Classes\TeacherReference;
use App\Domain\Classes\WeeklyPlan;
use App\Domain\Common\InvalidValue;
use App\Tests\Support\Classes\FakeTeacherDirectory;
use App\Tests\Support\Classes\InMemoryClassGroupRepository;
use PHPUnit\Framework\TestCase;

final class ClassGroupManagementTest extends TestCase
{
    private InMemoryClassGroupRepository $groups;
    private FakeTeacherDirectory $teachers;
    private string $teacherId;

    protected function setUp(): void
    {
        $this->groups = new InMemoryClassGroupRepository();
        $this->teachers = new FakeTeacherDirectory();
        $this->teacherId = TeacherReference::generate()->value;
        $this->teachers->active[$this->teacherId] = true;
    }

    public function test_should_create_a_group_from_raw_input(): void
    {
        $id = $this->create($this->input());

        $group = $this->groups->find(ClassGroupId::fromString($id));
        self::assertSame('Iniciación A', $group?->details()->name->value);
        self::assertSame(WeeklyPlan::TwoHours, $group->details()->weeklyPlan());
    }

    public function test_should_reject_a_group_that_clashes_with_another_in_the_same_classroom(): void
    {
        $this->create($this->input(name: 'Intermedio A', start: '17:30', end: '19:00'));

        try {
            $this->create($this->input());
            self::fail('Se esperaba ClassroomConflict');
        } catch (ClassroomConflict $conflict) {
            self::assertSame('Intermedio A', $conflict->details()['groupName']);
            self::assertSame('Lun y Mié · 17:30–19:00', $conflict->details()['slotLabel']);
            self::assertStringContainsString('Intermedio A', $conflict->getMessage());
        }
    }

    public function test_should_allow_the_same_hours_in_the_other_classroom(): void
    {
        $this->create($this->input(name: 'Intermedio A'));

        $this->create($this->input(classroom: 2));

        self::assertCount(2, $this->groups->all());
    }

    public function test_should_require_an_active_teacher(): void
    {
        $this->teachers->active[$this->teacherId] = false;

        $this->expectException(TeacherNotAvailable::class);

        $this->create($this->input());
    }

    public function test_should_reject_invalid_input_with_the_offending_field(): void
    {
        try {
            $this->create($this->input(end: '16:30'));
            self::fail('Se esperaba InvalidValue');
        } catch (InvalidValue $invalid) {
            self::assertSame('end', $invalid->field);
        }
    }

    public function test_should_update_a_group_without_clashing_with_itself(): void
    {
        $id = $this->create($this->input());

        new UpdateClassGroup($this->groups, $this->teachers)($id, $this->input(name: 'Iniciación A (tarde)', end: '18:30'));

        self::assertSame('Iniciación A (tarde)', $this->groups->find(ClassGroupId::fromString($id))?->details()->name->value);
    }

    public function test_should_fail_clearly_when_updating_an_unknown_group(): void
    {
        $this->expectException(ClassGroupNotFound::class);

        new UpdateClassGroup($this->groups, $this->teachers)(ClassGroupId::generate()->value, $this->input());
    }

    private function create(GroupInput $input): string
    {
        return new CreateClassGroup($this->groups, $this->teachers)($input);
    }

    private function input(string $name = 'Iniciación A', string $start = '17:00', string $end = '18:00', int $classroom = 1): GroupInput
    {
        return new GroupInput($name, 'beginner', $this->teacherId, ['mon', 'wed'], $start, $end, $classroom, 12);
    }
}

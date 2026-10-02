<?php

declare(strict_types=1);

namespace App\Tests\Integration\Persistence\Classes;

use App\Application\Teachers\RegisterTeacher;
use App\Domain\Classes\ClassGroup;
use App\Domain\Classes\ClassGroupId;
use App\Domain\Classes\Enrolment;
use App\Domain\Classes\EnrolmentId;
use App\Domain\Classes\Level;
use App\Domain\Classes\StudentReference;
use App\Domain\Classes\TeacherReference;
use App\Domain\Classes\Weekday;
use App\Domain\Common\LocalDate;
use App\Infrastructure\Classes\TeachersTeacherDirectory;
use App\Infrastructure\Persistence\Doctrine\Repository\Classes\DoctrineClassGroupRepository;
use App\Infrastructure\Persistence\Doctrine\Repository\Classes\DoctrineEnrolmentRepository;
use App\Infrastructure\Persistence\Doctrine\Repository\Teachers\DoctrineTeacherRepository;
use App\Infrastructure\Teachers\ClassesTeacherAssignments;
use App\Tests\Support\Classes\GroupFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class ClassesPersistenceTest extends KernelTestCase
{
    private DoctrineClassGroupRepository $groups;
    private DoctrineEnrolmentRepository $enrolments;
    private TeacherReference $teacher;

    protected function setUp(): void
    {
        $container = self::getContainer();
        $this->groups = $container->get(DoctrineClassGroupRepository::class);
        $this->enrolments = $container->get(DoctrineEnrolmentRepository::class);
        $this->teacher = TeacherReference::fromString(new RegisterTeacher($container->get(DoctrineTeacherRepository::class))('Lucía Moreno Gil'));
    }

    public function test_should_restore_a_saved_group_with_all_its_details(): void
    {
        $group = $this->group('Intermedio A', [Weekday::Wednesday, Weekday::Monday], '18:00', '19:30', classroom: 2);
        $this->clear();

        $found = $this->groups->find($group->id());

        self::assertNotNull($found);
        self::assertSame('Intermedio A', $found->details()->name->value);
        self::assertSame([Weekday::Monday, Weekday::Wednesday], $found->details()->slot->days());
        self::assertSame('18:00', $found->details()->slot->start->toString());
        self::assertSame(2, $found->details()->classroom->number);
        self::assertTrue($found->details()->teacher->equals($this->teacher));
        self::assertCount(1, $this->groups->all());
    }

    public function test_should_persist_enrolments_and_find_the_active_ones(): void
    {
        $group = $this->group('Iniciación A', [Weekday::Monday], '17:00', '18:00');
        $student = StudentReference::generate();
        $past = Enrolment::start(EnrolmentId::generate(), $student, $group->id(), LocalDate::fromString('2026-09-01'));
        $past->endOn(LocalDate::fromString('2026-09-20'));
        $current = Enrolment::start(EnrolmentId::generate(), $student, $group->id(), LocalDate::fromString('2026-09-20'));
        $this->enrolments->save($past);
        $this->enrolments->save($current);
        $this->clear();

        $today = LocalDate::fromString('2026-10-02');

        self::assertSame(1, $this->enrolments->activeCount($group->id(), $today));
        $active = $this->enrolments->activeForStudent($student, $today);
        self::assertCount(1, $active);
        self::assertTrue($active[0]->id()->equals($current->id()));
        self::assertNotNull($this->enrolments->activeForStudentInGroup($student, $group->id(), $today));
    }

    public function test_should_list_groups_with_teacher_occupancy_and_plan(): void
    {
        $group = $this->group('Iniciación A', [Weekday::Monday, Weekday::Wednesday], '17:00', '18:00');
        $this->enrolments->save(Enrolment::start(EnrolmentId::generate(), StudentReference::generate(), $group->id(), LocalDate::fromString('2026-09-15')));

        $summaries = self::getContainer()->get(\App\Infrastructure\Classes\SqlClassQuery::class)->groups(LocalDate::fromString('2026-10-02'));

        self::assertCount(1, $summaries);
        $summary = $summaries[0];
        self::assertSame('Iniciación A', $summary->name);
        self::assertSame('Lucía Moreno Gil', $summary->teacherName);
        self::assertSame(1, $summary->occupied);
        self::assertSame(12, $summary->capacity);
        self::assertSame('two_hours', $summary->weeklyPlan);
        self::assertSame(['mon', 'wed'], $summary->days);
        self::assertSame('Lun y Mié · 17:00–18:00', $summary->slotLabel);
    }

    public function test_should_order_groups_by_first_weekday_then_start_time(): void
    {
        $this->group('Viernes', [Weekday::Friday], '16:30', '17:30');
        $this->group('Lunes tarde', [Weekday::Monday], '18:00', '19:00');
        $this->group('Lunes pronto', [Weekday::Monday, Weekday::Wednesday], '17:00', '18:00', classroom: 2);

        $names = array_map(static fn ($g): string => $g->name, self::getContainer()->get(\App\Infrastructure\Classes\SqlClassQuery::class)->groups(LocalDate::fromString('2026-10-02')));

        self::assertSame(['Lunes pronto', 'Lunes tarde', 'Viernes'], $names);
    }

    public function test_should_answer_teacher_questions_across_contexts(): void
    {
        $this->group('Iniciación A', [Weekday::Monday], '17:00', '18:00');
        $container = self::getContainer();

        self::assertTrue($container->get(TeachersTeacherDirectory::class)->isActive($this->teacher));
        self::assertFalse($container->get(TeachersTeacherDirectory::class)->isActive(TeacherReference::generate()));
        self::assertSame(1, $container->get(ClassesTeacherAssignments::class)->groupCount(\App\Domain\Teachers\TeacherId::fromString($this->teacher->value)));
    }

    /** @param list<Weekday> $days */
    private function group(string $name, array $days, string $start, string $end, int $classroom = 1): ClassGroup
    {
        $details = GroupFactory::details($name, $days, $start, $end, $classroom, 12, Level::Intermediate, $this->teacher);
        $group = ClassGroup::create(ClassGroupId::generate(), $details);
        $this->groups->save($group);

        return $group;
    }

    private function clear(): void
    {
        self::getContainer()->get(EntityManagerInterface::class)->clear();
    }
}

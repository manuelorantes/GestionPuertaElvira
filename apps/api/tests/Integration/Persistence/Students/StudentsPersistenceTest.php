<?php

declare(strict_types=1);

namespace App\Tests\Integration\Persistence\Students;

use App\Application\Classes\CreateClassGroup;
use App\Application\Classes\GroupInput;
use App\Application\Students\LinkSiblings;
use App\Application\Students\RegisterStudent;
use App\Application\Students\StudentFilter;
use App\Application\Students\StudentInput;
use App\Application\Students\WithdrawStudent;
use App\Application\Teachers\RegisterTeacher;
use App\Domain\Classes\StudentReference;
use App\Domain\Common\LocalDate;
use App\Domain\Students\StudentId;
use App\Infrastructure\Classes\SqlClassQuery;
use App\Infrastructure\Classes\StudentsStudentStatus;
use App\Infrastructure\Persistence\Doctrine\Repository\Students\DoctrineStudentRepository;
use App\Infrastructure\Students\SqlStudentQuery;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class StudentsPersistenceTest extends KernelTestCase
{
    private string $groupA;
    private string $groupB;

    protected function setUp(): void
    {
        $c = self::getContainer();
        $teacher = $c->get(RegisterTeacher::class)('Lucía Moreno Gil');
        $this->groupA = $c->get(CreateClassGroup::class)(new GroupInput('Iniciación A', 'beginner', $teacher, ['mon', 'wed'], '17:00', '18:00', 1, 12));
        $this->groupB = $c->get(CreateClassGroup::class)(new GroupInput('Particular', 'private_lesson', $teacher, ['fri'], '17:30', '19:00', 2, 2));
    }

    public function test_should_restore_a_registered_student_with_all_details(): void
    {
        $id = $this->register('Martina López Herrera', [$this->groupA]);
        self::getContainer()->get(EntityManagerInterface::class)->clear();

        $student = self::getContainer()->get(DoctrineStudentRepository::class)->find(StudentId::fromString($id));

        self::assertNotNull($student);
        self::assertSame('Martina López Herrera', $student->details()->fullName->value);
        self::assertSame('2014-03-12', $student->details()->birthDate->toString());
        self::assertSame('12345678Z', $student->details()->nationalId?->value);
        self::assertSame('Rocío Herrera', $student->details()->guardians[0]->name->value);
        self::assertSame('AND-20417', $student->details()->federationLicence?->value);
        self::assertTrue($student->details()->imageConsent);
    }

    public function test_should_enrol_on_registration_and_count_in_the_group(): void
    {
        $this->register('Martina López Herrera', [$this->groupA, $this->groupB]);

        $groups = self::getContainer()->get(SqlClassQuery::class)->groups($this->today());

        self::assertSame([1, 1], array_map(static fn ($g): int => $g->occupied, $groups));
    }

    public function test_should_search_without_accents_and_filter_by_status_and_siblings(): void
    {
        $martina = $this->register('Martina López Herrera', [$this->groupA]);
        $pablo = $this->register('Pablo López Herrera', [$this->groupA]);
        $hugo = $this->register('Hugo Martín Castillo', [$this->groupA]);
        $c = self::getContainer();
        $c->get(LinkSiblings::class)($martina, $pablo);
        $c->get(WithdrawStudent::class)($hugo, $this->today()->toString());
        $query = $c->get(SqlStudentQuery::class);

        self::assertSame(['Martina López Herrera', 'Pablo López Herrera'], $this->names($query->list(StudentFilter::All, 'lopez', $this->today())));
        self::assertSame(['Hugo Martín Castillo'], $this->names($query->list(StudentFilter::All, 'MARTÍN Cas', $this->today())));
        self::assertSame(['Hugo Martín Castillo'], $this->names($query->list(StudentFilter::Withdrawn, null, $this->today())));
        self::assertSame(['Martina López Herrera', 'Pablo López Herrera'], $this->names($query->list(StudentFilter::Active, null, $this->today())));
        self::assertSame(['Martina López Herrera', 'Pablo López Herrera'], $this->names($query->list(StudentFilter::Siblings, null, $this->today())));
        self::assertSame(3, $query->total());
    }

    public function test_should_show_the_detail_with_groups_and_siblings(): void
    {
        $martina = $this->register('Martina López Herrera', [$this->groupA, $this->groupB]);
        $pablo = $this->register('Pablo López Herrera', [$this->groupA]);
        self::getContainer()->get(LinkSiblings::class)($martina, $pablo);

        $detail = self::getContainer()->get(SqlStudentQuery::class)->detail($martina, $this->today());

        self::assertNotNull($detail);
        self::assertSame(12, $detail->age);
        self::assertSame(['Iniciación A', 'Particular'], array_map(static fn ($g): string => $g->name, $detail->groups));
        self::assertSame('Lucía Moreno Gil', $detail->groups[0]->teacherName);
        self::assertSame([['id' => $pablo, 'fullName' => 'Pablo López Herrera']], $detail->siblings);
        self::assertSame('active', $detail->status);
    }

    public function test_should_list_the_students_of_a_group_and_report_their_status(): void
    {
        $martina = $this->register('Martina López Herrera', [$this->groupA]);

        $students = self::getContainer()->get(SqlClassQuery::class)->enrolledStudents($this->groupA, $this->today());

        self::assertSame([['id' => $martina, 'fullName' => 'Martina López Herrera', 'age' => 12]], $students);
        self::assertTrue(self::getContainer()->get(StudentsStudentStatus::class)->isActive(StudentReference::fromString($martina)));
    }

    /** @param list<string> $groups */
    private function register(string $name, array $groups): string
    {
        $input = new StudentInput($name, '2014-03-12', '12345678Z', 'familia@ejemplo.com', [['name' => 'Rocío Herrera', 'phone' => '612481930']], null, 'AND-20417', true);

        return self::getContainer()->get(RegisterStudent::class)($input, $groups, [], false);
    }

    private function today(): LocalDate
    {
        return LocalDate::fromInstant(new DateTimeImmutable());
    }

    /**
     * @param list<\App\Application\Students\StudentSummary> $list
     *
     * @return list<string>
     */
    private function names(array $list): array
    {
        return array_map(static fn ($s): string => $s->fullName, $list);
    }
}

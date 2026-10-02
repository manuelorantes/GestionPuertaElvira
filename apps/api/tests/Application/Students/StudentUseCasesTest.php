<?php

declare(strict_types=1);

namespace App\Tests\Application\Students;

use App\Application\Students\Error\StudentNotFound;
use App\Application\Students\LinkSiblings;
use App\Application\Students\RegisterStudent;
use App\Application\Students\StudentInput;
use App\Application\Students\UnlinkSiblings;
use App\Application\Students\UpdateStudent;
use App\Application\Students\WithdrawStudent;
use App\Domain\Classes\Error\GroupFull;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Students\Error\MissingContact;
use App\Domain\Students\StudentId;
use App\Tests\Support\FrozenClock;
use App\Tests\Support\ImmediateTransactionRunner;
use App\Tests\Support\Students\InMemoryStudentRepository;
use App\Tests\Support\Students\SpyEnrolments;
use PHPUnit\Framework\TestCase;

final class StudentUseCasesTest extends TestCase
{
    private InMemoryStudentRepository $students;
    private SpyEnrolments $enrolments;
    private ImmediateTransactionRunner $transactions;
    private FrozenClock $clock;

    protected function setUp(): void
    {
        $this->students = new InMemoryStudentRepository();
        $this->enrolments = new SpyEnrolments();
        $this->transactions = new ImmediateTransactionRunner();
        $this->clock = new FrozenClock('2026-10-02 10:00:00');
    }

    public function test_should_register_a_student_and_enrol_them_in_their_groups_atomically(): void
    {
        $id = $this->register(['g1', 'g2']);

        $student = $this->students->find(StudentId::fromString($id));
        self::assertSame('Martina López Herrera', $student?->details()->fullName->value);
        self::assertSame('Rocío Herrera', $student->details()->guardians[0]->name->value);
        self::assertSame('612 48 19 30', $student->details()->guardians[0]->phone->value);
        self::assertSame([['student' => $id, 'groups' => ['g1', 'g2'], 'confirmed' => false]], $this->enrolments->enrolled);
        self::assertSame(1, $this->transactions->runs);
    }

    public function test_should_require_at_least_one_group(): void
    {
        try {
            $this->register([]);
            self::fail('Se esperaba InvalidValue');
        } catch (InvalidValue $invalid) {
            self::assertSame('groupIds', $invalid->field);
        }
    }

    public function test_should_propagate_enrolment_problems_so_nothing_is_saved_in_the_transaction(): void
    {
        $this->enrolments->failWith = new GroupFull(12, 12);

        $this->expectException(GroupFull::class);

        $this->register(['g1']);
    }

    public function test_should_link_the_given_siblings_both_ways_when_registering(): void
    {
        $sister = $this->register(['g1']);

        $brother = $this->register(['g2'], siblingIds: [$sister]);

        self::assertEquals([StudentId::fromString($sister)], $this->students->find(StudentId::fromString($brother))?->siblings());
        self::assertEquals([StudentId::fromString($brother)], $this->students->find(StudentId::fromString($sister))?->siblings());
    }

    public function test_should_update_personal_details_with_the_contact_rules(): void
    {
        $id = $this->register(['g1']);

        new UpdateStudent($this->students, $this->clock)($id, $this->input(name: 'Martina López'));
        self::assertSame('Martina López', $this->students->find(StudentId::fromString($id))?->details()->fullName->value);

        $this->expectException(MissingContact::class);
        new UpdateStudent($this->students, $this->clock)($id, $this->input(guardians: []));
    }

    public function test_should_withdraw_and_end_enrolments_on_the_same_date(): void
    {
        $id = $this->register(['g1']);

        new WithdrawStudent($this->students, $this->enrolments, $this->transactions, $this->clock)($id, '2026-10-31');

        self::assertFalse($this->students->find(StudentId::fromString($id))?->isActiveOn(LocalDate::fromString('2026-10-31')));
        self::assertSame([['student' => $id, 'on' => '2026-10-31']], $this->enrolments->ended);
    }

    public function test_should_link_and_unlink_siblings_mutually(): void
    {
        $a = $this->register(['g1']);
        $b = $this->register(['g2']);

        new LinkSiblings($this->students, $this->transactions)($a, $b);
        self::assertCount(1, $this->students->find(StudentId::fromString($b))?->siblings() ?? []);

        new UnlinkSiblings($this->students, $this->transactions)($b, $a);
        self::assertSame([], $this->students->find(StudentId::fromString($a))?->siblings());
        self::assertSame([], $this->students->find(StudentId::fromString($b))?->siblings());
    }

    public function test_should_fail_clearly_for_unknown_students(): void
    {
        $this->expectException(StudentNotFound::class);

        new UpdateStudent($this->students, $this->clock)(StudentId::generate()->value, $this->input());
    }

    /**
     * @param list<string> $groupIds
     * @param list<string> $siblingIds
     */
    private function register(array $groupIds, array $siblingIds = []): string
    {
        return new RegisterStudent($this->students, $this->enrolments, $this->transactions, $this->clock)($this->input(), $groupIds, $siblingIds, false);
    }

    /** @param list<array{name: string, phone: string}>|null $guardians */
    private function input(string $name = 'Martina López Herrera', ?array $guardians = null): StudentInput
    {
        return new StudentInput(
            fullName: $name,
            birthDate: '2014-03-12',
            nationalId: '12345678Z',
            contactEmail: 'familia@ejemplo.com',
            guardians: $guardians ?? [['name' => 'Rocío Herrera', 'phone' => '612481930']],
            ownPhone: null,
            federationLicence: null,
            imageConsent: true,
        );
    }
}

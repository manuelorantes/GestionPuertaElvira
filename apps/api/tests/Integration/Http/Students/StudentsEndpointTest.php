<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http\Students;

use App\Domain\Identity\Role;
use App\Tests\Support\Identity\ApiAuthTestCase;
use DateTimeImmutable;
use DateTimeZone;

final class StudentsEndpointTest extends ApiAuthTestCase
{
    private string $groupA;
    private string $groupB;
    private string $tiny;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');
        $this->json('POST', '/api/admin/teachers', ['fullName' => 'Lucía Moreno Gil']);
        $teacher = $this->idFromResponse();
        $this->groupA = $this->newGroup($teacher, 'Iniciación A', ['mon', 'wed'], '17:00', '18:00', 1, 12);
        $this->groupB = $this->newGroup($teacher, 'Particular', ['fri'], '17:30', '19:00', 2, 2);
        $this->tiny = $this->newGroup($teacher, 'Peques B', ['tue'], '16:00', '17:00', 2, 1);
    }

    public function test_should_register_list_and_show_a_student(): void
    {
        $this->json('POST', '/api/admin/students', $this->student(['groupIds' => [$this->groupA, $this->groupB]]));
        self::assertResponseStatusCodeSame(201);
        $id = $this->idFromResponse();

        $this->client->request('GET', '/api/admin/students?q=lopez&filter=active');
        self::assertResponseIsSuccessful();
        $list = $this->responseBody();
        self::assertSame(1, $list['total'] ?? null);
        $first = $this->items()[0] ?? null;
        self::assertIsArray($first);
        self::assertSame('Martina López Herrera', $first['fullName'] ?? null);
        self::assertIsArray($first['groups'] ?? null);
        self::assertSame(['Iniciación A', 'Particular'], array_column($first['groups'], 'name'));

        $this->client->request('GET', "/api/admin/students/{$id}");
        $detail = $this->responseBody();
        self::assertSame('2014-03-12', $detail['birthDate'] ?? null);
        self::assertSame([['name' => 'Rocío Herrera', 'phone' => '612 48 19 30']], $detail['guardians'] ?? null);
        self::assertSame('AND-20417', $detail['federationLicence'] ?? null);
        self::assertSame('active', $detail['status'] ?? null);
    }

    public function test_should_refuse_a_minor_without_guardians_pointing_at_the_field(): void
    {
        $this->json('POST', '/api/admin/students', $this->student(['guardians' => []]));

        $this->assertError(422, 'missing_contact');
        self::assertSame('guardians', $this->errorDetails()['field'] ?? null);
    }

    public function test_should_ask_for_confirmation_when_the_group_is_full(): void
    {
        $this->json('POST', '/api/admin/students', $this->student(['fullName' => 'Mateo Cano Robles', 'groupIds' => [$this->tiny]]));

        $this->json('POST', '/api/admin/students', $this->student(['groupIds' => [$this->tiny]]));
        $this->assertError(409, 'group_full');
        self::assertSame(['occupied' => 1, 'capacity' => 1], $this->errorDetails());

        $this->client->request('GET', '/api/admin/students');
        self::assertSame(1, $this->responseBody()['total'] ?? null, 'El alta fallida no deja rastro');

        $this->json('POST', '/api/admin/students', $this->student(['groupIds' => [$this->tiny], 'confirmOverCapacity' => true]));
        self::assertResponseStatusCodeSame(201);
    }

    public function test_should_add_move_and_remove_groups_keeping_at_least_one(): void
    {
        $this->json('POST', '/api/admin/students', $this->student());
        $id = $this->idFromResponse();

        $this->json('POST', "/api/admin/students/{$id}/enrolments", ['groupId' => $this->groupB]);
        self::assertResponseStatusCodeSame(204);

        $this->json('POST', "/api/admin/students/{$id}/enrolments/{$this->groupB}/move", ['toGroupId' => $this->tiny]);
        self::assertResponseStatusCodeSame(204);

        $this->json('DELETE', "/api/admin/students/{$id}/enrolments/{$this->tiny}");
        self::assertResponseStatusCodeSame(204);

        $this->json('DELETE', "/api/admin/students/{$id}/enrolments/{$this->groupA}");
        $this->assertError(409, 'last_enrolment');

        $this->client->request('GET', "/api/admin/groups/{$this->groupA}");
        self::assertSame([['id' => $id, 'fullName' => 'Martina López Herrera', 'age' => 12]], $this->responseBody()['students'] ?? null);
    }

    public function test_should_update_withdraw_and_manage_siblings(): void
    {
        $this->json('POST', '/api/admin/students', $this->student());
        $martina = $this->idFromResponse();
        $this->json('POST', '/api/admin/students', $this->student(['fullName' => 'Pablo López Herrera']));
        $pablo = $this->idFromResponse();

        $this->json('PUT', "/api/admin/students/{$martina}", $this->student(['fullName' => 'Martina López']));
        self::assertResponseStatusCodeSame(204);

        $this->json('POST', "/api/admin/students/{$martina}/siblings", ['siblingId' => $pablo]);
        self::assertResponseStatusCodeSame(204);
        $this->client->request('GET', "/api/admin/students/{$pablo}");
        self::assertSame([['id' => $martina, 'fullName' => 'Martina López']], $this->responseBody()['siblings'] ?? null);

        $this->json('DELETE', "/api/admin/students/{$pablo}/siblings/{$martina}");
        self::assertResponseStatusCodeSame(204);

        $this->json('POST', "/api/admin/students/{$martina}/withdrawal", ['date' => new DateTimeImmutable('now', new DateTimeZone('Europe/Madrid'))->format('Y-m-d')]);
        self::assertResponseStatusCodeSame(204);
        $this->client->request('GET', '/api/admin/students?filter=withdrawn');
        self::assertSame(['Martina López'], array_column($this->items(), 'fullName'));
        $this->client->request('GET', "/api/admin/groups/{$this->groupA}");
        self::assertSame(1, $this->responseBody()['occupied'] ?? null);
    }

    public function test_should_answer_not_found_and_forbid_teachers(): void
    {
        $this->client->request('GET', '/api/admin/students/01990000-0000-7000-8000-000000000000');
        $this->assertError(404, 'not_found');

        $this->createUser('profe@club.es', Role::Teacher);
        $this->logIn('profe@club.es');
        $this->client->request('GET', '/api/admin/students');
        $this->assertError(403, 'forbidden');
    }

    /**
     * @param array<string, mixed> $overrides
     *
     * @return array<string, mixed>
     */
    private function student(array $overrides = []): array
    {
        return [...[
            'fullName' => 'Martina López Herrera',
            'birthDate' => '2014-03-12',
            'nationalId' => '12345678Z',
            'contactEmail' => 'familia@ejemplo.com',
            'guardians' => [['name' => 'Rocío Herrera', 'phone' => '612481930']],
            'ownPhone' => null,
            'federationLicence' => 'AND-20417',
            'imageConsent' => true,
            'groupIds' => [$this->groupA],
        ], ...$overrides];
    }

    /** @param list<string> $days */
    private function newGroup(string $teacher, string $name, array $days, string $start, string $end, int $classroom, int $capacity): string
    {
        $this->json('POST', '/api/admin/groups', ['name' => $name, 'level' => 'beginner', 'teacherId' => $teacher, 'days' => $days, 'start' => $start, 'end' => $end, 'classroom' => $classroom, 'capacity' => $capacity]);

        return $this->idFromResponse();
    }

    /** @return list<array<mixed>> */
    private function items(): array
    {
        $items = $this->responseBody()['items'] ?? null;
        self::assertIsArray($items);
        self::assertIsList($items);

        /** @var list<array<mixed>> $items */
        return $items;
    }

    private function idFromResponse(): string
    {
        $id = $this->responseBody()['id'] ?? null;
        self::assertIsString($id);

        return $id;
    }
}

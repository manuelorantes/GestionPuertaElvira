<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http\Classes;

use App\Domain\Identity\Role;
use App\Tests\Support\Identity\ApiAuthTestCase;

final class ClassGroupsEndpointTest extends ApiAuthTestCase
{
    private string $teacherId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');
        $this->json('POST', '/api/admin/teachers', ['fullName' => 'Lucía Moreno Gil']);
        $id = $this->responseBody()['id'] ?? null;
        self::assertIsString($id);
        $this->teacherId = $id;
    }

    public function test_should_create_a_group_and_show_it_in_the_schedule(): void
    {
        $this->json('POST', '/api/admin/groups', $this->group());
        self::assertResponseStatusCodeSame(201);
        $id = $this->responseBody()['id'] ?? null;

        $this->client->request('GET', '/api/admin/groups');

        self::assertResponseIsSuccessful();
        self::assertSame([[
            'id' => $id,
            'name' => 'Iniciación A',
            'level' => 'beginner',
            'teacher' => ['id' => $this->teacherId, 'fullName' => 'Lucía Moreno Gil'],
            'days' => ['mon', 'wed'],
            'start' => '17:00',
            'end' => '18:00',
            'slotLabel' => 'Lun y Mié · 17:00–18:00',
            'classroom' => 1,
            'capacity' => 12,
            'occupied' => 0,
            'weeklyPlan' => 'two_hours',
        ]], $this->responseBody()['items'] ?? null);
    }

    public function test_should_return_one_group_and_update_it(): void
    {
        $this->json('POST', '/api/admin/groups', $this->group());
        $id = $this->responseBody()['id'] ?? null;
        self::assertIsString($id);

        $this->json('PUT', "/api/admin/groups/{$id}", $this->group(['name' => 'Iniciación A (tarde)', 'capacity' => 10]));
        self::assertResponseStatusCodeSame(204);

        $this->client->request('GET', "/api/admin/groups/{$id}");
        self::assertSame('Iniciación A (tarde)', $this->responseBody()['name'] ?? null);
        self::assertSame(10, $this->responseBody()['capacity'] ?? null);
    }

    public function test_should_reject_a_classroom_conflict_naming_the_other_group(): void
    {
        $this->json('POST', '/api/admin/groups', $this->group(['name' => 'Intermedio A', 'start' => '17:30', 'end' => '19:00']));

        $this->json('POST', '/api/admin/groups', $this->group());

        $this->assertError(409, 'classroom_conflict');
        self::assertSame('Intermedio A', $this->errorDetails()['groupName'] ?? null);
    }

    public function test_should_report_the_invalid_field(): void
    {
        $this->json('POST', '/api/admin/groups', $this->group(['end' => '16:30']));

        $this->assertError(422, 'unprocessable');
        self::assertSame('end', $this->errorDetails()['field'] ?? null);
    }

    public function test_should_answer_not_found_for_an_unknown_group(): void
    {
        $this->client->request('GET', '/api/admin/groups/01990000-0000-7000-8000-000000000000');

        $this->assertError(404, 'not_found');
    }

    public function test_should_forbid_teachers(): void
    {
        $this->createUser('profe@club.es', Role::Teacher);
        $this->logIn('profe@club.es');

        $this->client->request('GET', '/api/admin/groups');

        $this->assertError(403, 'forbidden');
    }

    /**
     * @param array<string, mixed> $overrides
     *
     * @return array<string, mixed>
     */
    private function group(array $overrides = []): array
    {
        return [...['name' => 'Iniciación A', 'level' => 'beginner', 'teacherId' => $this->teacherId, 'days' => ['mon', 'wed'], 'start' => '17:00', 'end' => '18:00', 'classroom' => 1, 'capacity' => 12], ...$overrides];
    }
}

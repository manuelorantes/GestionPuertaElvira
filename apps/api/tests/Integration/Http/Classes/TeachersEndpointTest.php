<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http\Classes;

use App\Domain\Identity\Role;
use App\Tests\Support\Identity\ApiAuthTestCase;

final class TeachersEndpointTest extends ApiAuthTestCase
{
    public function test_should_create_list_rename_and_deactivate_teachers(): void
    {
        $this->loginAsAdmin();

        $this->json('POST', '/api/admin/teachers', ['fullName' => 'Carlos Ruiz Márquez']);
        self::assertResponseStatusCodeSame(201);
        $id = $this->responseBody()['id'] ?? null;
        self::assertIsString($id);

        $this->json('PUT', "/api/admin/teachers/{$id}", ['fullName' => 'Carlos Ruiz', 'active' => false, 'hourlyRate' => '18']);
        self::assertResponseStatusCodeSame(204);

        $this->client->request('GET', '/api/admin/teachers');
        self::assertResponseIsSuccessful();
        self::assertSame([['id' => $id, 'fullName' => 'Carlos Ruiz', 'active' => false, 'groupCount' => 0, 'hourlyRate' => '18.00']], $this->responseBody()['items'] ?? null);
    }

    public function test_should_explain_why_a_teacher_with_groups_cannot_be_deactivated(): void
    {
        $this->loginAsAdmin();
        $teacherId = $this->newTeacher('Lucía Moreno Gil');
        $this->newGroup($teacherId);

        $this->json('PUT', "/api/admin/teachers/{$teacherId}", ['fullName' => 'Lucía Moreno Gil', 'active' => false]);

        $this->assertError(409, 'teacher_has_groups');
    }

    public function test_should_be_reserved_to_administrators(): void
    {
        $this->client->request('GET', '/api/admin/teachers');
        $this->assertError(401, 'unauthorized');

        $this->createUser('profe@club.es', Role::Teacher);
        $this->logIn('profe@club.es');
        $this->client->request('GET', '/api/admin/teachers');
        $this->assertError(403, 'forbidden');
    }

    private function loginAsAdmin(): void
    {
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');
    }

    private function newTeacher(string $name): string
    {
        $this->json('POST', '/api/admin/teachers', ['fullName' => $name]);
        $id = $this->responseBody()['id'] ?? null;
        self::assertIsString($id);

        return $id;
    }

    private function newGroup(string $teacherId): void
    {
        $this->json('POST', '/api/admin/groups', ['name' => 'Iniciación A', 'level' => 'beginner', 'teacherId' => $teacherId, 'days' => ['mon', 'wed'], 'start' => '17:00', 'end' => '18:00', 'classroom' => 1, 'capacity' => 12]);
        self::assertResponseStatusCodeSame(201);
    }
}

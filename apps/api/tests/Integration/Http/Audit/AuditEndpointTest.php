<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http\Audit;

use App\Domain\Identity\Role;
use App\Tests\Support\Identity\ApiAuthTestCase;

final class AuditEndpointTest extends ApiAuthTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');
    }

    public function test_should_record_who_did_each_action_with_a_field_by_field_detail(): void
    {
        $teacher = $this->createTeacher('Lucía Moreno Gil');
        $this->json('PUT', "/api/admin/teachers/{$teacher}", ['fullName' => 'Lucía Moreno Gil', 'active' => true, 'hourlyRate' => '18']);

        $actions = $this->actions();
        self::assertSame('Editar profesor', $actions[0]['label'] ?? null);
        self::assertSame(['Profesor'], $actions[0]['affected'] ?? null);
        self::assertSame('Crear profesor', $actions[1]['label'] ?? null);
        self::assertNotSame('Sistema', $actions[0]['userName'] ?? null);
        self::assertContains('Inicio de sesión', array_column($actions, 'label'));

        $id = $actions[0]['id'] ?? null;
        self::assertIsString($id);
        $this->client->request('GET', "/api/admin/audit/actions/{$id}");
        $changes = $this->responseBody()['changes'] ?? null;
        self::assertIsArray($changes);
        self::assertIsArray($changes[0] ?? null);
        self::assertSame('U', $changes[0]['operation'] ?? null);
        self::assertSame([['field' => 'hourly_rate_cents', 'before' => 1500, 'after' => 1800]], $changes[0]['fields'] ?? null);
    }

    public function test_should_undo_an_action_unless_a_later_one_touched_the_same_records(): void
    {
        $teacher = $this->createTeacher('Carlos Ruiz Márquez');
        $create = $this->latestId();
        $this->json('PUT', "/api/admin/teachers/{$teacher}", ['fullName' => 'Carlos Ruiz Márquez', 'active' => true, 'hourlyRate' => '20']);
        $edit = $this->latestId();

        $this->json('POST', "/api/admin/audit/actions/{$create}/undo");
        $this->assertError(409, 'undo_conflict');

        $this->json('POST', "/api/admin/audit/actions/{$edit}/undo");
        self::assertResponseStatusCodeSame(204);
        self::assertSame('15.00', $this->teacher('Carlos Ruiz Márquez')['hourlyRate'] ?? null);
        self::assertSame('Deshacer: Editar profesor', $this->actions()[0]['label'] ?? null);
    }

    public function test_should_go_back_to_any_point_and_undo_the_restore_itself(): void
    {
        $first = $this->createTeacher('Ana Belén Torres');
        $point = $this->latestId();
        $this->createTeacher('Javier Ortega Sánchez');
        $this->json('PUT', "/api/admin/teachers/{$first}", ['fullName' => 'Ana Belén Torres', 'active' => true, 'hourlyRate' => '16']);

        $this->json('POST', "/api/admin/audit/actions/{$point}/restore");
        self::assertSame(2, $this->responseBody()['reverted'] ?? null);
        self::assertNull($this->teacher('Javier Ortega Sánchez'));
        self::assertSame('15.00', $this->teacher('Ana Belén Torres')['hourlyRate'] ?? null);

        $restore = $this->actions()[0];
        self::assertIsString($restore['label'] ?? null);
        self::assertStringStartsWith('Volver al punto: Crear profesor', $restore['label']);
        $this->json('POST', '/api/admin/audit/actions/'.$this->latestId().'/undo');
        self::assertResponseStatusCodeSame(204);
        self::assertNotNull($this->teacher('Javier Ortega Sánchez'));
        self::assertSame('16.00', $this->teacher('Ana Belén Torres')['hourlyRate'] ?? null);
    }

    public function test_should_record_failed_logins_and_be_reserved_to_administrators(): void
    {
        $this->json('POST', '/api/auth/login', ['email' => 'nadie@club.es', 'password' => 'incorrecta-123']);
        $this->logIn('junta@club.es');
        self::assertContains('Intento de acceso fallido', array_column($this->actions(), 'label'));

        $this->createUser('profe@club.es', Role::Teacher);
        $this->logIn('profe@club.es');
        $this->client->request('GET', '/api/admin/audit/actions');
        self::assertResponseStatusCodeSame(403);
    }

    private function createTeacher(string $name): string
    {
        $this->json('POST', '/api/admin/teachers', ['fullName' => $name]);
        $id = $this->responseBody()['id'] ?? null;
        self::assertIsString($id);

        return $id;
    }

    private function latestId(): string
    {
        $id = $this->actions()[0]['id'] ?? null;
        self::assertIsString($id);

        return $id;
    }

    /** @return list<array<string, mixed>> */
    private function actions(): array
    {
        $this->client->request('GET', '/api/admin/audit/actions');
        $items = $this->responseBody()['items'] ?? null;
        self::assertIsArray($items);

        /** @var list<array<string, mixed>> $items */
        return $items;
    }

    /** @return array<string, mixed>|null */
    private function teacher(string $name): ?array
    {
        $this->client->request('GET', '/api/admin/teachers');
        $items = $this->responseBody()['items'] ?? [];
        self::assertIsArray($items);
        foreach ($items as $item) {
            if (\is_array($item) && $name === ($item['fullName'] ?? null)) {
                /** @var array<string, mixed> $item */
                return $item;
            }
        }

        return null;
    }
}

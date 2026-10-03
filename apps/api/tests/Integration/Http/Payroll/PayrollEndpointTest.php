<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http\Payroll;

use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;
use App\Domain\Identity\Role;
use App\Tests\Support\Identity\ApiAuthTestCase;
use DateTimeImmutable;
use DateTimeZone;

final class PayrollEndpointTest extends ApiAuthTestCase
{
    private string $teacher;
    private string $month;
    private string $today;

    protected function setUp(): void
    {
        parent::setUp();
        $this->today = new DateTimeImmutable('now', new DateTimeZone('Europe/Madrid'))->format('Y-m-d');
        $this->month = substr($this->today, 0, 7);
        if (null === Season::teachingSeason(YearMonth::fromString($this->month))) {
            self::markTestSkipped('En julio y agosto no hay clases.');
        }
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');
        $this->json('POST', '/api/admin/teachers', ['fullName' => 'Lucía Moreno Gil']);
        $this->teacher = $this->id();
        $this->json('PUT', "/api/admin/teachers/{$this->teacher}", ['fullName' => 'Lucía Moreno Gil', 'active' => true, 'hourlyRate' => '16']);
        $this->json('POST', '/api/admin/groups', ['name' => 'Iniciación A', 'level' => 'beginner', 'teacherId' => $this->teacher, 'days' => ['mon', 'tue', 'wed', 'thu', 'fri'], 'start' => '17:00', 'end' => '18:00', 'classroom' => 1, 'capacity' => 12]);
        $this->id();
    }

    public function test_should_propose_edit_and_settle_the_sessions_of_the_month(): void
    {
        $this->client->request('GET', "/api/admin/payroll/sessions?month={$this->month}");
        self::assertResponseIsSuccessful();
        $sessions = $this->list('items');
        self::assertNotEmpty($sessions);
        self::assertSame('Iniciación A', $sessions[0]['label'] ?? null);
        self::assertSame(1600, $sessions[0]['costCents'] ?? null);
        $count = \count($sessions);

        $this->json('POST', '/api/admin/payroll/sessions', ['teacherId' => $this->teacher, 'date' => $this->today, 'activity' => 'Torneo escolar', 'hours' => 2.5]);
        self::assertResponseStatusCodeSame(201);
        $extra = $this->id();
        $this->json('PUT', "/api/admin/payroll/sessions/{$extra}", ['teacherId' => $this->teacher, 'hours' => 3]);
        self::assertResponseStatusCodeSame(204);

        $first = $sessions[0]['date'];
        self::assertIsString($first);
        $this->json('POST', '/api/admin/payroll/holidays', ['date' => $first]);
        self::assertSame(1, $this->responseBody()['removed'] ?? null);

        $this->client->request('GET', "/api/admin/payroll/settlements?month={$this->month}");
        $settlement = $this->list('items')[0];
        self::assertSame('pending', $settlement['status'] ?? null);
        self::assertSame(($count - 1) * 60 + 180, $settlement['minutes'] ?? null);

        $this->json('POST', "/api/admin/payroll/settlements/{$this->month}/payment", ['date' => $this->today]);
        self::assertSame(1, $this->responseBody()['paid'] ?? null);

        $this->client->request('GET', "/api/admin/payroll/settlements/{$this->teacher}/{$this->month}");
        $detail = $this->responseBody();
        self::assertSame('paid', $detail['status'] ?? null);
        self::assertIsArray($detail['club'] ?? null);

        $this->json('DELETE', "/api/admin/payroll/sessions/{$extra}");
        $this->assertError(409, 'settlement_paid');
    }

    public function test_should_report_profitability_and_forbid_teachers(): void
    {
        $this->client->request('GET', "/api/admin/payroll/profitability?month={$this->month}");
        self::assertResponseIsSuccessful();
        $row = $this->list('items')[0];
        self::assertSame('Lucía Moreno Gil', $row['teacherName'] ?? null);
        self::assertSame(['Iniciación A'], $row['groups'] ?? null);
        self::assertSame(12, $row['capacity'] ?? null);

        $this->json('DELETE', '/api/admin/payroll/sessions/01990000-0000-7000-8000-000000000000');
        $this->assertError(404, 'not_found');

        $this->createUser('profe@club.es', Role::Teacher);
        $this->logIn('profe@club.es');
        $this->client->request('GET', "/api/admin/payroll/settlements?month={$this->month}");
        self::assertResponseStatusCodeSame(403);
    }

    private function id(): string
    {
        $id = $this->responseBody()['id'] ?? null;
        self::assertIsString($id);

        return $id;
    }

    /** @return list<array<mixed>> */
    private function list(string $key): array
    {
        $items = $this->responseBody()[$key] ?? null;
        self::assertIsArray($items);

        /** @var list<array<mixed>> $items */
        return $items;
    }
}

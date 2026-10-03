<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http\Dashboard;

use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;
use App\Domain\Identity\Role;
use App\Tests\Support\Identity\ApiAuthTestCase;
use DateTimeImmutable;
use DateTimeZone;

final class DashboardEndpointTest extends ApiAuthTestCase
{
    public function test_should_summarise_the_club_with_real_figures(): void
    {
        $today = new DateTimeImmutable('now', new DateTimeZone('Europe/Madrid'))->format('Y-m-d');
        if (null === Season::teachingSeason(YearMonth::fromString(substr($today, 0, 7)))) {
            self::markTestSkipped('En julio y agosto no hay cuotas.');
        }
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');
        $this->json('POST', '/api/admin/teachers', ['fullName' => 'Lucía Moreno Gil']);
        $teacher = $this->responseBody()['id'];
        $this->json('POST', '/api/admin/groups', ['name' => 'Iniciación A', 'level' => 'beginner', 'teacherId' => $teacher, 'days' => ['mon', 'wed'], 'start' => '17:00', 'end' => '18:00', 'classroom' => 1, 'capacity' => 4]);
        $group = $this->responseBody()['id'];
        $this->json('POST', '/api/admin/students', ['fullName' => 'Martina López Herrera', 'birthDate' => '2014-03-12', 'guardians' => [['name' => 'Rocío Herrera', 'phone' => '612481930']], 'imageConsent' => true, 'groupIds' => [$group]]);
        $student = $this->responseBody()['id'];
        $this->json('POST', '/api/admin/billing/payments', ['studentId' => $student, 'kind' => 'monthly', 'months' => 1, 'method' => 'cash', 'date' => $today]);
        $this->json('POST', '/api/admin/accounting/entries', ['date' => $today, 'kind' => 'expense', 'concept' => 'Material', 'category' => 'material', 'method' => 'card', 'amount' => '20']);

        $this->client->request('GET', '/api/admin/dashboard');
        self::assertResponseIsSuccessful();
        $summary = $this->responseBody();

        self::assertSame(4500, $summary['collectedCents'] ?? null);
        self::assertSame(0, $summary['pendingCents'] ?? null);
        self::assertSame(2000, $summary['expensesCents'] ?? null);
        self::assertSame(1, $summary['activeStudents'] ?? null);
        self::assertIsArray($summary['chart'] ?? null);
        self::assertCount(12, $summary['chart']);
        self::assertSame(['month' => substr($today, 0, 7), 'incomeCents' => 4500, 'expenseCents' => 2000], $summary['chart'][11]);
        self::assertSame(['percent' => 25, 'fullGroups' => 0, 'emptiest' => [['id' => $group, 'name' => 'Iniciación A', 'teacherName' => 'Lucía Moreno Gil', 'occupied' => 1, 'capacity' => 4]]], $summary['occupancy'] ?? null);
        self::assertIsArray($summary['latest'] ?? null);
        self::assertCount(2, $summary['latest']);
        self::assertSame([], $summary['overdue'] ?? null);
    }

    public function test_should_be_reserved_to_administrators(): void
    {
        $this->createUser('profe@club.es', Role::Teacher);
        $this->logIn('profe@club.es');

        $this->client->request('GET', '/api/admin/dashboard');

        self::assertResponseStatusCodeSame(403);
    }
}

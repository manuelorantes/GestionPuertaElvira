<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http\Billing;

use App\Domain\Billing\Season;
use App\Domain\Billing\YearMonth;
use App\Domain\Common\LocalDate;
use App\Domain\Identity\Role;
use App\Tests\Support\Identity\ApiAuthTestCase;
use DateTimeImmutable;
use DateTimeZone;

final class BillingEndpointTest extends ApiAuthTestCase
{
    private string $student;
    private string $teacher;
    private string $today;

    protected function setUp(): void
    {
        parent::setUp();
        $this->today = new DateTimeImmutable('now', new DateTimeZone('Europe/Madrid'))->format('Y-m-d');
        if (null === Season::teachingSeason(YearMonth::of(LocalDate::fromString($this->today)))) {
            self::markTestSkipped('En julio y agosto no hay cuotas.');
        }
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');
        $this->json('POST', '/api/admin/teachers', ['fullName' => 'Lucía Moreno Gil']);
        $this->teacher = $this->id();
        $this->json('POST', '/api/admin/groups', ['name' => 'Iniciación A', 'level' => 'beginner', 'teacherId' => $this->teacher, 'days' => ['mon', 'wed'], 'start' => '17:00', 'end' => '18:00', 'classroom' => 1, 'capacity' => 12]);
        $group = $this->id();
        $this->json('POST', '/api/admin/students', [
            'fullName' => 'Martina López Herrera', 'birthDate' => '2014-03-12', 'guardians' => [['name' => 'Rocío Herrera', 'phone' => '612481930']],
            'imageConsent' => true, 'groupIds' => [$group],
        ]);
        $this->student = $this->id();
    }

    public function test_should_list_the_charges_of_the_month_quote_and_register_a_payment(): void
    {
        $this->client->request('GET', '/api/admin/billing/charges');
        self::assertResponseIsSuccessful();
        $body = $this->responseBody();
        self::assertSame(substr($this->today, 0, 7), $body['month'] ?? null);
        self::assertIsArray($body['items'] ?? null);
        self::assertIsArray($body['items'][0] ?? null);
        $charge = $body['items'][0];
        self::assertSame('Martina López Herrera', $charge['studentName'] ?? null);
        self::assertSame(4500, $charge['amountCents'] ?? null);
        self::assertContains($charge['status'] ?? null, ['due', 'overdue']);
        self::assertSame(['expectedCents' => 4500, 'collectedCents' => 0, 'pendingCents' => 4500, 'overdueCount' => 'overdue' === $charge['status'] ? 1 : 0], $body['totals'] ?? null);

        $request = ['studentId' => $this->student, 'kind' => 'monthly', 'months' => 1, 'method' => 'cash', 'date' => $this->today, 'specialDiscount' => ['percent' => 10, 'concept' => 'Canje de puntos']];
        $this->json('POST', '/api/admin/billing/quote', $request);
        self::assertResponseIsSuccessful();
        self::assertSame(4050, $this->responseBody()['totalCents'] ?? null);
        self::assertSame(['2 h semanales · 1 mes', 'Canje de puntos −10 %'], array_column($this->list('lines'), 'label'));

        $this->json('POST', '/api/admin/billing/payments', $request);
        self::assertResponseStatusCodeSame(201);
        $payment = $this->id();

        $this->client->request('GET', "/api/admin/billing/payments/{$payment}");
        $receipt = $this->responseBody();
        self::assertIsString($receipt['receiptNumber'] ?? null);
        self::assertMatchesRegularExpression('/^R-\d{4}-0001$/', $receipt['receiptNumber']);
        self::assertSame('Rocío Herrera', $receipt['guardianName'] ?? null);
        self::assertSame('Efectivo', $receipt['methodLabel'] ?? null);
        self::assertIsArray($receipt['club'] ?? null);
        self::assertSame('Club Ajedrez Puerta Elvira', $receipt['club']['name'] ?? null);

        $this->json('POST', "/api/admin/billing/payments/{$payment}/invoice", ['name' => 'Rocío Herrera', 'taxId' => '12345678Z', 'address' => 'Calle Elvira 1, Granada']);
        self::assertResponseStatusCodeSame(204);
        $this->json('POST', "/api/admin/billing/payments/{$payment}/invoice", ['name' => 'Rocío Herrera', 'taxId' => '12345678Z', 'address' => 'Calle Elvira 1, Granada']);
        $this->assertError(409, 'invoice_already_issued');

        $this->client->request('GET', "/api/admin/billing/payments?studentId={$this->student}");
        self::assertCount(1, $this->list('items'));
        $this->client->request('GET', '/api/admin/billing/charges');
        self::assertSame('paid', $this->list('items')[0]['status'] ?? null);
    }

    public function test_should_manage_the_student_account_and_points(): void
    {
        $this->json('PUT', "/api/admin/billing/accounts/{$this->student}", ['preferredPlan' => 'three_months', 'member' => true, 'privateRate' => '35']);
        self::assertResponseStatusCodeSame(204);
        $this->json('POST', "/api/admin/billing/accounts/{$this->student}/points", ['delta' => 4]);
        self::assertSame(4, $this->responseBody()['points'] ?? null);

        $this->client->request('GET', "/api/admin/billing/accounts/{$this->student}");
        $account = $this->responseBody();
        self::assertSame('three_months', $account['preferredPlan'] ?? null);
        self::assertTrue($account['member'] ?? null);
        self::assertSame('35.00', $account['privateRate'] ?? null);
        self::assertSame(4, $account['points'] ?? null);
        self::assertIsInt($account['suggestedMonths'] ?? null);
        self::assertIsInt($account['remainingMonths'] ?? null);

        $this->json('POST', "/api/admin/billing/accounts/{$this->student}/points", ['delta' => -5]);
        $this->assertError(422, 'unprocessable');
    }

    public function test_should_read_and_update_settings(): void
    {
        $this->client->request('GET', '/api/admin/billing/settings');
        $settings = $this->responseBody();
        self::assertSame('55.00', $settings['threeHours'] ?? null);
        self::assertSame(20, $settings['seasonPercent'] ?? null);
        self::assertSame([], $settings['privateRates'] ?? null);

        /** @var array<string, mixed> $settings */
        $settings['threeHours'] = '60';
        $settings['privateRates'] = [$this->teacher => '32.5'];
        $this->json('PUT', '/api/admin/billing/settings', $settings);
        self::assertResponseStatusCodeSame(204);

        $this->client->request('GET', '/api/admin/billing/settings');
        self::assertSame('60.00', $this->responseBody()['threeHours'] ?? null);
        self::assertSame([$this->teacher => '32.50'], $this->responseBody()['privateRates'] ?? null);
    }

    public function test_should_explain_invalid_payments_and_forbid_teachers(): void
    {
        $this->json('POST', '/api/admin/billing/quote', ['studentId' => $this->student, 'kind' => 'monthly', 'months' => 11, 'method' => 'cash', 'date' => $this->today]);
        $this->assertError(422, 'invalid_months');

        $this->json('POST', '/api/admin/billing/quote', ['studentId' => $this->student, 'kind' => 'membership', 'months' => 1, 'method' => 'cash', 'date' => $this->today]);
        $this->assertError(409, 'nothing_to_pay');

        $this->client->request('GET', '/api/admin/billing/payments/01990000-0000-7000-8000-000000000000');
        $this->assertError(404, 'not_found');

        $this->createUser('profe@club.es', Role::Teacher);
        $this->logIn('profe@club.es');
        $this->client->request('GET', '/api/admin/billing/charges');
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

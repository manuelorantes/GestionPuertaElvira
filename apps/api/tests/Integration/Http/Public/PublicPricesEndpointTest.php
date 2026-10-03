<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http\Public;

use App\Tests\Support\Identity\ApiAuthTestCase;

final class PublicPricesEndpointTest extends ApiAuthTestCase
{
    public function test_should_publish_the_current_prices_without_a_session(): void
    {
        $this->client->request('GET', '/api/public/prices');

        self::assertResponseIsSuccessful();
        $prices = $this->responseBody();
        self::assertIsString($prices['season'] ?? null);
        self::assertMatchesRegularExpression('#^\d{4}/\d{2}$#', $prices['season']);
        self::assertSame([
            ['weeklyHours' => 3, 'monthlyCents' => 5500],
            ['weeklyHours' => 2, 'monthlyCents' => 4500],
            ['weeklyHours' => 1.5, 'monthlyCents' => 4000],
            ['weeklyHours' => 1, 'monthlyCents' => 3500],
        ], $prices['tiers'] ?? null);
        self::assertSame(5000, $prices['membershipCents'] ?? null);
        self::assertSame(10, $prices['familyPercent'] ?? null);
        self::assertSame(['threeMonths' => 10, 'sixMonths' => 15, 'season' => 20], $prices['prepaymentPercent'] ?? null);
        self::assertSame(3000, $prices['privateHourCents'] ?? null);
    }

    public function test_should_follow_the_settings_changed_by_the_club(): void
    {
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');
        $this->client->request('GET', '/api/admin/billing/settings');
        /** @var array<string, mixed> $settings */
        $settings = $this->responseBody();
        $settings['threeHours'] = '60';
        $this->json('PUT', '/api/admin/billing/settings', $settings);

        $this->client->request('GET', '/api/public/prices');

        $tiers = $this->responseBody()['tiers'] ?? null;
        self::assertIsArray($tiers);
        self::assertIsArray($tiers[0] ?? null);
        self::assertSame(6000, $tiers[0]['monthlyCents'] ?? null);
    }
}

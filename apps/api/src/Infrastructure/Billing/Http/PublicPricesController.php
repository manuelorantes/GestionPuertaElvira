<?php

declare(strict_types=1);

namespace App\Infrastructure\Billing\Http;

use App\Application\Billing\Port\BillingSettingsRepository;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

/** Precios de la temporada para la web pública: los mismos ajustes con los que se cobra. */
#[Route('/api/public/prices', name: 'api_public_prices', methods: ['GET'])]
#[OA\Tag(name: 'Público')]
final readonly class PublicPricesController
{
    public function __invoke(BillingSettingsRepository $settings, Clock $clock): JsonResponse
    {
        $s = $settings->get();
        $t = $s->tariff;

        return new JsonResponse([
            'season' => Season::containing(YearMonth::of(LocalDate::fromInstant($clock->now())))->label(),
            'tiers' => [
                ['weeklyHours' => 3.0, 'monthlyCents' => $t->threeHours->cents],
                ['weeklyHours' => 2.0, 'monthlyCents' => $t->twoHours->cents],
                ['weeklyHours' => 1.5, 'monthlyCents' => $t->hourAndHalf->cents],
                ['weeklyHours' => 1.0, 'monthlyCents' => $t->oneHour->cents],
            ],
            'membershipCents' => $t->membershipFee->cents,
            'familyPercent' => $t->familyPercent,
            'prepaymentPercent' => ['threeMonths' => $t->threeMonthsPercent, 'sixMonths' => $t->sixMonthsPercent, 'season' => $t->seasonPercent],
            'privateHourCents' => $s->defaultPrivateRate->cents,
        ]);
    }
}

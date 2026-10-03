<?php

declare(strict_types=1);

namespace App\Infrastructure\Dashboard\Http;

use App\Application\Dashboard\ClubSummary;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/dashboard', name: 'api_admin_dashboard')]
#[OA\Tag(name: 'Resumen')]
final readonly class DashboardController
{
    #[Route('', name: '', methods: ['GET'])]
    public function __invoke(ClubSummary $summary): JsonResponse
    {
        return new JsonResponse($summary());
    }
}

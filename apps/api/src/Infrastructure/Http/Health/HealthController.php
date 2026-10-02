<?php

declare(strict_types=1);

namespace App\Infrastructure\Http\Health;

use App\Application\Health\CheckHealth;
use App\Application\Health\HealthStatus;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final readonly class HealthController
{
    public function __construct(private CheckHealth $checkHealth)
    {
    }

    #[Route('/api/health', name: 'api_health', methods: ['GET'])]
    #[OA\Get(summary: 'Estado de la API y de sus dependencias', tags: ['Sistema'])]
    #[OA\Response(response: 200, description: 'La API y la base de datos responden')]
    #[OA\Response(response: 503, description: 'Alguna dependencia no responde')]
    public function __invoke(): JsonResponse
    {
        $report = ($this->checkHealth)();
        $healthy = HealthStatus::Healthy === $report->status;

        return new JsonResponse(
            [
                'status' => $report->status->value,
                'database' => $report->databaseReachable ? 'reachable' : 'unreachable',
            ],
            $healthy ? Response::HTTP_OK : Response::HTTP_SERVICE_UNAVAILABLE,
        );
    }
}

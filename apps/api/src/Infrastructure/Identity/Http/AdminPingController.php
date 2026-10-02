<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Http;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Comprobación de acceso por rol. Se retirará cuando la primera sección real de administración
 * tenga su propio test de rol.
 */
final readonly class AdminPingController
{
    #[Route('/api/admin/ping', name: 'api_admin_ping', methods: ['GET'])]
    public function __invoke(): JsonResponse
    {
        return new JsonResponse(['status' => 'ok']);
    }
}

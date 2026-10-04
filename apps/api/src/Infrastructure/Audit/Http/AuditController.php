<?php

declare(strict_types=1);

namespace App\Infrastructure\Audit\Http;

use App\Application\Audit\AuditActionId;
use App\Application\Audit\AuditFilter;
use App\Application\Audit\Error\AuditActionNotFound;
use App\Application\Audit\Port\AuditLog;
use App\Application\Audit\RestoreToPoint;
use App\Application\Audit\UndoAction;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/audit', name: 'api_admin_audit_', requirements: ['id' => '[0-9a-f-]{36}'])]
#[OA\Tag(name: 'Historial')]
final readonly class AuditController
{
    public function __construct(private AuditLog $log)
    {
    }

    #[Route('/actions', name: 'actions', methods: ['GET'])]
    public function actions(Request $request): JsonResponse
    {
        $user = $request->query->get('userId');
        $before = $request->query->get('before');

        return new JsonResponse([
            'items' => $this->log->actions(new AuditFilter(
                \is_string($user) && '' !== $user ? AuditActionId::fromString($user)->value : null,
                is_numeric($before) ? (int) $before : null,
            )),
            'people' => $this->log->people(),
        ]);
    }

    #[Route('/actions/{id}', name: 'action', methods: ['GET'])]
    public function action(string $id): JsonResponse
    {
        $action = $this->log->action($id) ?? throw new AuditActionNotFound();

        return new JsonResponse(['action' => $action, 'changes' => $this->log->changes($id)]);
    }

    #[Route('/actions/{id}/undo', name: 'undo', methods: ['POST'])]
    public function undo(string $id, UndoAction $undo): Response
    {
        $undo($id);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/actions/{id}/restore', name: 'restore', methods: ['POST'])]
    public function restore(string $id, RestoreToPoint $restore): JsonResponse
    {
        return new JsonResponse(['reverted' => $restore($id)]);
    }
}

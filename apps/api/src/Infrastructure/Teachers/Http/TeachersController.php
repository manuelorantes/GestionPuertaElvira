<?php

declare(strict_types=1);

namespace App\Infrastructure\Teachers\Http;

use App\Application\Teachers\ActivateTeacher;
use App\Application\Teachers\ChangeTeacherRate;
use App\Application\Teachers\DeactivateTeacher;
use App\Application\Teachers\Port\TeacherQuery;
use App\Application\Teachers\RegisterTeacher;
use App\Application\Teachers\RenameTeacher;
use App\Infrastructure\Http\JsonBody;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/teachers', name: 'api_admin_teachers_')]
#[OA\Tag(name: 'Profesorado')]
final readonly class TeachersController
{
    #[Route('', name: 'list', methods: ['GET'])]
    public function list(TeacherQuery $query): JsonResponse
    {
        return new JsonResponse(['items' => $query->all()]);
    }

    #[Route('', name: 'create', methods: ['POST'])]
    public function create(Request $request, RegisterTeacher $register): JsonResponse
    {
        return new JsonResponse(['id' => $register(JsonBody::from($request)->requiredString('fullName'))], Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'update', methods: ['PUT'])]
    public function update(
        string $id,
        Request $request,
        RenameTeacher $rename,
        ActivateTeacher $activate,
        DeactivateTeacher $deactivate,
        ChangeTeacherRate $changeRate,
    ): Response {
        $body = JsonBody::from($request);
        $rename($id, $body->requiredString('fullName'));
        $rate = $body->optionalString('hourlyRate');
        if (null !== $rate) {
            $changeRate($id, $rate);
        }
        $body->bool('active', true) ? $activate($id) : $deactivate($id);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Students\Http;

use App\Application\Classes\EnrolStudent;
use App\Application\Classes\MoveStudent;
use App\Application\Classes\UnenrolStudent;
use App\Infrastructure\Http\JsonBody;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/students/{id}/enrolments', name: 'api_admin_enrolments_', requirements: ['id' => '[0-9a-f-]{36}', 'groupId' => '[0-9a-f-]{36}'])]
#[OA\Tag(name: 'Alumnado')]
final readonly class EnrolmentsController
{
    #[Route('', name: 'add', methods: ['POST'])]
    public function add(string $id, Request $request, EnrolStudent $enrol): Response
    {
        $body = JsonBody::from($request);
        $enrol($id, $body->requiredString('groupId'), $body->bool('confirmOverCapacity'));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/{groupId}', name: 'remove', methods: ['DELETE'])]
    public function remove(string $id, string $groupId, UnenrolStudent $unenrol): Response
    {
        $unenrol($id, $groupId);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/{groupId}/move', name: 'move', methods: ['POST'])]
    public function move(string $id, string $groupId, Request $request, MoveStudent $move): Response
    {
        $body = JsonBody::from($request);
        $move($id, $groupId, $body->requiredString('toGroupId'), $body->bool('confirmOverCapacity'));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }
}

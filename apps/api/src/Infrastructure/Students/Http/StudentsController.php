<?php

declare(strict_types=1);

namespace App\Infrastructure\Students\Http;

use App\Application\Students\Error\StudentNotFound;
use App\Application\Students\LinkSiblings;
use App\Application\Students\Port\StudentQuery;
use App\Application\Students\RegisterStudent;
use App\Application\Students\StudentFilter;
use App\Application\Students\StudentInput;
use App\Application\Students\UnlinkSiblings;
use App\Application\Students\UpdateStudent;
use App\Application\Students\WithdrawStudent;
use App\Domain\Common\Clock;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Infrastructure\Http\JsonBody;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/students', name: 'api_admin_students_', requirements: ['id' => '[0-9a-f-]{36}', 'siblingId' => '[0-9a-f-]{36}'])]
#[OA\Tag(name: 'Alumnado')]
final readonly class StudentsController
{
    public function __construct(private StudentQuery $query, private Clock $clock)
    {
    }

    #[Route('', name: 'list', methods: ['GET'])]
    public function list(Request $request): JsonResponse
    {
        $filter = StudentFilter::tryFrom((string) $request->query->get('filter', 'all')) ?? throw new InvalidValue('filter', 'Filtro desconocido.');
        $search = $request->query->get('q');

        return new JsonResponse([
            'items' => $this->query->list($filter, \is_string($search) ? $search : null, $this->today()),
            'total' => $this->query->total(),
        ]);
    }

    #[Route('/{id}', name: 'show', methods: ['GET'])]
    public function show(string $id): JsonResponse
    {
        return new JsonResponse($this->query->detail($id, $this->today()) ?? throw new StudentNotFound());
    }

    #[Route('', name: 'create', methods: ['POST'])]
    public function create(Request $request, RegisterStudent $register): JsonResponse
    {
        $body = JsonBody::from($request);
        $id = $register(self::input($body), $body->stringList('groupIds'), $body->stringList('siblingIds'), $body->bool('confirmOverCapacity'));

        return new JsonResponse(['id' => $id], Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'update', methods: ['PUT'])]
    public function update(string $id, Request $request, UpdateStudent $update): Response
    {
        $update($id, self::input(JsonBody::from($request)));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/withdrawal', name: 'withdraw', methods: ['POST'])]
    public function withdraw(string $id, Request $request, WithdrawStudent $withdraw): Response
    {
        $withdraw($id, JsonBody::from($request)->requiredString('date'));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/siblings', name: 'link_sibling', methods: ['POST'])]
    public function linkSibling(string $id, Request $request, LinkSiblings $link): Response
    {
        $link($id, JsonBody::from($request)->requiredString('siblingId'));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/siblings/{siblingId}', name: 'unlink_sibling', methods: ['DELETE'])]
    public function unlinkSibling(string $id, string $siblingId, UnlinkSiblings $unlink): Response
    {
        $unlink($id, $siblingId);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    private function today(): LocalDate
    {
        return LocalDate::fromInstant($this->clock->now());
    }

    private static function input(JsonBody $body): StudentInput
    {
        return new StudentInput(
            $body->requiredString('fullName'),
            $body->requiredString('birthDate'),
            $body->optionalString('nationalId'),
            $body->optionalString('contactEmail'),
            array_map(static function (array $guardian): array {
                $values = JsonBody::fromArray($guardian);

                return ['name' => $values->requiredString('name'), 'phone' => $values->requiredString('phone')];
            }, $body->objectList('guardians')),
            $body->optionalString('ownPhone'),
            $body->optionalString('federationLicence'),
            $body->bool('imageConsent'),
        );
    }
}

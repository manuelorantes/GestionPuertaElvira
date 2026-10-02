<?php

declare(strict_types=1);

namespace App\Infrastructure\Classes\Http;

use App\Application\Classes\CreateClassGroup;
use App\Application\Classes\Error\ClassGroupNotFound;
use App\Application\Classes\GroupInput;
use App\Application\Classes\GroupSummary;
use App\Application\Classes\Port\ClassQuery;
use App\Application\Classes\UpdateClassGroup;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Infrastructure\Http\JsonBody;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/groups', name: 'api_admin_groups_')]
#[OA\Tag(name: 'Clases')]
final readonly class ClassGroupsController
{
    public function __construct(private ClassQuery $query, private Clock $clock)
    {
    }

    #[Route('', name: 'list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        return new JsonResponse(['items' => array_map(self::present(...), $this->query->groups($this->today()))]);
    }

    #[Route('/{id}', name: 'show', methods: ['GET'], requirements: ['id' => '[0-9a-f-]{36}'])]
    public function show(string $id): JsonResponse
    {
        $group = $this->query->group($id, $this->today()) ?? throw new ClassGroupNotFound();

        return new JsonResponse([...self::present($group), 'students' => $this->query->enrolledStudents($id, $this->today())]);
    }

    #[Route('', name: 'create', methods: ['POST'])]
    public function create(Request $request, CreateClassGroup $create): JsonResponse
    {
        return new JsonResponse(['id' => $create(self::input($request))], Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'update', methods: ['PUT'], requirements: ['id' => '[0-9a-f-]{36}'])]
    public function update(string $id, Request $request, UpdateClassGroup $update): Response
    {
        $update($id, self::input($request));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    private function today(): LocalDate
    {
        return LocalDate::fromInstant($this->clock->now());
    }

    private static function input(Request $request): GroupInput
    {
        $body = JsonBody::from($request);

        return new GroupInput(
            $body->requiredString('name'),
            $body->requiredString('level'),
            $body->requiredString('teacherId'),
            $body->stringList('days'),
            $body->requiredString('start'),
            $body->requiredString('end'),
            $body->requiredInt('classroom'),
            $body->requiredInt('capacity'),
        );
    }

    /** @return array<string, mixed> */
    private static function present(GroupSummary $group): array
    {
        return [
            'id' => $group->id,
            'name' => $group->name,
            'level' => $group->level,
            'teacher' => ['id' => $group->teacherId, 'fullName' => $group->teacherName],
            'days' => $group->days,
            'start' => $group->start,
            'end' => $group->end,
            'slotLabel' => $group->slotLabel,
            'classroom' => $group->classroom,
            'capacity' => $group->capacity,
            'occupied' => $group->occupied,
            'weeklyPlan' => $group->weeklyPlan,
        ];
    }
}

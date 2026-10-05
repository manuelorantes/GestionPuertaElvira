<?php

declare(strict_types=1);

namespace App\Infrastructure\Import\Http;

use App\Application\Import\ApplyImport;
use App\Application\Import\ImportDecision;
use App\Application\Import\ImportPreviewRow;
use App\Application\Import\PreviewImport;
use App\Infrastructure\Http\JsonBody;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/import', name: 'api_admin_import_')]
#[OA\Tag(name: 'Importación')]
final readonly class ImportController
{
    #[Route('/preview', name: 'preview', methods: ['POST'])]
    public function preview(Request $request, PreviewImport $preview): JsonResponse
    {
        $rows = $preview(JsonBody::from($request)->requiredString('text'));

        return new JsonResponse(['rows' => array_map(static fn (ImportPreviewRow $r): array => [
            ...get_object_vars($r->row),
            'match' => $r->match,
            'suggestions' => $r->suggestions,
        ], $rows)]);
    }

    #[Route('/rows', name: 'row', methods: ['POST'])]
    public function row(Request $request, ApplyImport $apply): JsonResponse
    {
        $body = JsonBody::from($request);
        $d = $body->optionalObject('row') ?? throw new \App\Domain\Common\InvalidValue('row', 'Falta la fila.');
        $decision = new ImportDecision(
            $d->requiredInt('line'),
            $d->requiredString('action'),
            $d->optionalString('studentId'),
            $d->stringList('groupIds'),
            $d->optionalString('fullName'),
            $d->optionalString('birthDate'),
            $d->optionalString('guardianName'),
            $d->optionalString('guardianPhone'),
            $d->optionalString('email'),
            $d->bool('confirmDuplicate'),
        );

        return new JsonResponse($apply($body->requiredString('text'), $decision));
    }
}

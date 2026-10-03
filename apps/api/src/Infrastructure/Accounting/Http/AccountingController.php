<?php

declare(strict_types=1);

namespace App\Infrastructure\Accounting\Http;

use App\Application\Accounting\AttachDocument;
use App\Application\Accounting\CloseSeason;
use App\Application\Accounting\DeleteEntry;
use App\Application\Accounting\DeleteInvoice;
use App\Application\Accounting\EntryInput;
use App\Application\Accounting\Error\DocumentNotFound;
use App\Application\Accounting\Error\SupplierInvoiceNotFound;
use App\Application\Accounting\FiscalYearSummary;
use App\Application\Accounting\InvoiceInput;
use App\Application\Accounting\LedgerLine;
use App\Application\Accounting\MonthLedger;
use App\Application\Accounting\PayInvoice;
use App\Application\Accounting\Port\DocumentStorage;
use App\Application\Accounting\Port\InvoiceQuery;
use App\Application\Accounting\Port\SupplierInvoiceRepository;
use App\Application\Accounting\RecordEntry;
use App\Application\Accounting\RegisterInvoice;
use App\Application\Accounting\UploadedDocument;
use App\Domain\Accounting\LedgerCategory;
use App\Domain\Accounting\Method;
use App\Domain\Accounting\SupplierInvoiceId;
use App\Domain\Common\InvalidValue;
use App\Infrastructure\Http\JsonBody;
use finfo;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/accounting', name: 'api_admin_accounting_', requirements: ['id' => '[0-9a-f-]{36}', 'year' => '\d{4}'])]
#[OA\Tag(name: 'Contabilidad')]
final readonly class AccountingController
{
    #[Route('/ledger', name: 'ledger', methods: ['GET'])]
    public function ledger(Request $request, MonthLedger $ledger): JsonResponse
    {
        $month = $request->query->get('month');
        if (!\is_string($month) || '' === $month) {
            throw new InvalidValue('month', 'Indica el mes (AAAA-MM).');
        }
        $view = $ledger($month);

        return new JsonResponse([
            'month' => $view->month,
            'incomeCents' => $view->incomeCents,
            'expenseCents' => $view->expenseCents,
            'expensesByCategory' => $view->expensesByCategory,
            'items' => array_map(static fn (LedgerLine $l): array => [
                ...get_object_vars($l),
                'categoryLabel' => LedgerCategory::fromName($l->category)->label(),
                'methodLabel' => Method::fromName($l->method)->label(),
            ], $view->lines),
        ]);
    }

    #[Route('/entries', name: 'record_entry', methods: ['POST'])]
    public function recordEntry(Request $request, RecordEntry $record): JsonResponse
    {
        $b = JsonBody::from($request);

        return new JsonResponse(['id' => $record(new EntryInput($b->requiredString('date'), $b->requiredString('kind'), $b->requiredString('concept'), $b->requiredString('category'), $b->requiredString('method'), $b->requiredString('amount')))], Response::HTTP_CREATED);
    }

    #[Route('/entries/{id}', name: 'delete_entry', methods: ['DELETE'])]
    public function deleteEntry(string $id, DeleteEntry $delete): Response
    {
        $delete($id);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/invoices', name: 'invoices', methods: ['GET'])]
    public function invoices(InvoiceQuery $query): JsonResponse
    {
        return new JsonResponse(['items' => array_map(static fn ($i): array => [
            ...get_object_vars($i),
            'categoryLabel' => LedgerCategory::fromName($i->category)->label(),
        ], $query->all())]);
    }

    #[Route('/invoices', name: 'register_invoice', methods: ['POST'])]
    public function registerInvoice(Request $request, RegisterInvoice $register): JsonResponse
    {
        $field = static fn (string $name): string => \is_string($value = $request->request->get($name)) ? $value : '';
        $input = new InvoiceInput($field('date'), $field('number'), $field('supplier'), $field('concept'), $field('category'), $field('amount'));

        return new JsonResponse(['id' => $register($input, self::document($request, false))], Response::HTTP_CREATED);
    }

    #[Route('/invoices/{id}/payment', name: 'pay_invoice', methods: ['POST'])]
    public function payInvoice(string $id, Request $request, PayInvoice $pay): Response
    {
        $b = JsonBody::from($request);
        $pay($id, $b->requiredString('date'), $b->optionalString('method') ?? 'transfer');

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/invoices/{id}/attachment', name: 'attach', methods: ['POST'])]
    public function attach(string $id, Request $request, AttachDocument $attach): Response
    {
        $attach($id, self::document($request, true) ?? throw new InvalidValue('file', 'Elige el documento.'));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/invoices/{id}/attachment', name: 'download', methods: ['GET'])]
    public function download(string $id, SupplierInvoiceRepository $invoices, DocumentStorage $storage): Response
    {
        $invoice = $invoices->invoice(SupplierInvoiceId::fromString($id)) ?? throw new SupplierInvoiceNotFound();
        $attachment = $invoice->attachment() ?? throw new DocumentNotFound();

        return new Response($storage->read($attachment->key), Response::HTTP_OK, [
            'Content-Type' => $attachment->mimeType,
            'Content-Disposition' => HeaderUtils::makeDisposition(HeaderUtils::DISPOSITION_INLINE, $attachment->originalName, 'factura'),
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    #[Route('/invoices/{id}', name: 'delete_invoice', methods: ['DELETE'])]
    public function deleteInvoice(string $id, DeleteInvoice $delete): Response
    {
        $delete($id);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/years/{year}', name: 'year', methods: ['GET'])]
    public function year(int $year, FiscalYearSummary $summary): JsonResponse
    {
        return new JsonResponse($summary($year));
    }

    #[Route('/years/{year}/closing', name: 'close', methods: ['POST'])]
    public function close(int $year, CloseSeason $close): Response
    {
        $close($year);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    /** El tipo se deduce del contenido, no de lo que declare el navegador. */
    private static function document(Request $request, bool $required): ?UploadedDocument
    {
        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile) {
            return $required ? throw new InvalidValue('file', 'Elige el documento.') : null;
        }
        if (!$file->isValid()) {
            throw new InvalidValue('file', 'El documento no se ha podido subir (máximo 10 MB).');
        }
        $contents = file_get_contents($file->getPathname());
        $mimeType = new finfo(\FILEINFO_MIME_TYPE)->file($file->getPathname());

        return new UploadedDocument($file->getClientOriginalName(), false === $mimeType ? '' : $mimeType, false === $contents ? '' : $contents);
    }
}

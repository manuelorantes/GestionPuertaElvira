<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http\Accounting;

use App\Domain\Identity\Role;
use App\Tests\Support\Identity\ApiAuthTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

final class AccountingEndpointTest extends ApiAuthTestCase
{
    /** Lo que envía el navegador; el cliente de pruebas no lo pone solo. */
    private const string MULTIPART = 'multipart/form-data; boundary=----prueba';

    private string $pdf;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');
        $this->pdf = tempnam(sys_get_temp_dir(), 'pdf').'.pdf';
        file_put_contents($this->pdf, "%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
    }

    public function test_should_register_an_invoice_with_its_document_pay_it_and_see_it_in_the_ledger(): void
    {
        $this->client->request('POST', '/api/admin/accounting/invoices', [
            'date' => '2025-10-01', 'number' => 'R-2025-10', 'supplier' => 'Propietario del local', 'concept' => 'Alquiler octubre', 'category' => 'rent', 'amount' => '950',
        ], ['file' => new UploadedFile($this->pdf, 'alquiler.pdf', 'application/pdf', null, true)], ['HTTP_X_REQUESTED_WITH' => 'fetch', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => self::MULTIPART]);
        self::assertResponseStatusCodeSame(201);
        $id = $this->responseBody()['id'] ?? null;
        self::assertIsString($id);

        $this->client->request('GET', "/api/admin/accounting/invoices/{$id}/attachment");
        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'application/pdf');
        self::assertStringStartsWith('%PDF', (string) $this->client->getInternalResponse()->getContent());

        $this->json('POST', "/api/admin/accounting/invoices/{$id}/payment", ['date' => '2025-10-02', 'method' => 'transfer']);
        self::assertResponseStatusCodeSame(204);
        $this->json('DELETE', "/api/admin/accounting/invoices/{$id}");
        $this->assertError(409, 'invoice_paid');

        $this->json('POST', '/api/admin/accounting/entries', ['date' => '2025-10-15', 'kind' => 'income', 'concept' => 'Subvención', 'category' => 'grants', 'method' => 'transfer', 'amount' => '600']);
        self::assertResponseStatusCodeSame(201);

        $this->client->request('GET', '/api/admin/accounting/ledger?month=2025-10');
        $ledger = $this->responseBody();
        self::assertSame(60000, $ledger['incomeCents'] ?? null);
        self::assertSame(95000, $ledger['expenseCents'] ?? null);
        $items = $ledger['items'] ?? null;
        self::assertIsArray($items);
        self::assertIsArray($items[1] ?? null);
        self::assertSame('Alquiler', $items[1]['categoryLabel'] ?? null);

        $this->client->request('GET', '/api/admin/accounting/invoices');
        $invoices = $this->responseBody()['items'] ?? null;
        self::assertIsArray($invoices);
        self::assertIsArray($invoices[0] ?? null);
        self::assertSame('alquiler.pdf', $invoices[0]['attachmentName'] ?? null);
    }

    public function test_should_refuse_uploads_without_the_fetch_header_or_of_the_wrong_type(): void
    {
        $fields = ['date' => '2025-10-01', 'number' => 'X', 'supplier' => 'X', 'concept' => 'X', 'category' => 'rent', 'amount' => '1'];
        $this->client->request('POST', '/api/admin/accounting/invoices', $fields, ['file' => new UploadedFile($this->pdf, 'a.pdf', 'application/pdf', null, true)], ['CONTENT_TYPE' => self::MULTIPART]);
        $this->assertError(403, 'forbidden');

        $txt = tempnam(sys_get_temp_dir(), 'txt');
        file_put_contents($txt, 'no soy un pdf');
        $this->client->request('POST', '/api/admin/accounting/invoices', $fields, ['file' => new UploadedFile($txt, 'falso.pdf', 'application/pdf', null, true)], ['HTTP_X_REQUESTED_WITH' => 'fetch', 'CONTENT_TYPE' => self::MULTIPART]);
        $this->assertError(422, 'unprocessable');
    }

    public function test_should_summarise_and_close_a_past_season(): void
    {
        $this->json('POST', '/api/admin/accounting/entries', ['date' => '2024-11-10', 'kind' => 'expense', 'concept' => 'Comisión', 'category' => 'other_expenses', 'method' => 'card', 'amount' => '12.5']);

        $this->client->request('GET', '/api/admin/accounting/years/2024');
        $year = $this->responseBody();
        self::assertSame('2024/25', $year['label'] ?? null);
        self::assertTrue($year['canClose'] ?? null);
        self::assertCount(12, (array) ($year['months'] ?? []));

        $this->json('POST', '/api/admin/accounting/years/2024/closing');
        self::assertResponseStatusCodeSame(204);
        $this->json('POST', '/api/admin/accounting/entries', ['date' => '2025-01-10', 'kind' => 'income', 'concept' => 'Tarde', 'category' => 'other_income', 'method' => 'cash', 'amount' => '5']);
        $this->assertError(409, 'period_closed');

        $this->createUser('profe@club.es', Role::Teacher);
        $this->logIn('profe@club.es');
        $this->client->request('GET', '/api/admin/accounting/invoices');
        self::assertResponseStatusCodeSame(403);
    }
}

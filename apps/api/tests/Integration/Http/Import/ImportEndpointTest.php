<?php

declare(strict_types=1);

namespace App\Tests\Integration\Http\Import;

use App\Domain\Common\LocalDate;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;
use App\Tests\Support\Identity\ApiAuthTestCase;
use DateTimeImmutable;
use DateTimeZone;

final class ImportEndpointTest extends ApiAuthTestCase
{
    private const string SHEET = <<<'CSV'
        ,Fotos,,Cuota Anual,Chandal y polo,Federativa,Septiembre,Octubre,Noviembre,Diciembre,Enero,Febrero,Marzo,Abril,Mayo,Junio,Fecha Nacimiento,Madre ó Padre,Telefono,e-mail
        Hector Perez Ratkovsky,,Tarjetero,50,,,55,55,,,,,,,,,19/9/2016,Lenka,699615279,lenka@ejemplo.com
        Julio Requena Montenegro,,,50,25,,20,,,,,,,,,,7/2/17,Torcuato,690666005,torcuato@ejemplo.com
        Hector Perez,,,,,,30,,,,,,,,,,11/8/2017,Luis,678810154,lclemor@ejemplo.com
        Peque Sin Telefono,,,,,,20,,,,,,,,,,1/1/2019,,,
        CSV;

    private string $group;
    private string $hector;
    private string $seasonStart;

    protected function setUp(): void
    {
        parent::setUp();
        $today = LocalDate::fromInstant(new DateTimeImmutable('now', new DateTimeZone('Europe/Madrid')));
        $this->seasonStart = Season::containing(YearMonth::of($today))->firstMonth()->toString();
        $this->createUser('junta@club.es');
        $this->logIn('junta@club.es');
        $this->json('POST', '/api/admin/teachers', ['fullName' => 'Lucía Moreno Gil']);
        $teacher = $this->responseBody()['id'];
        $this->json('POST', '/api/admin/groups', ['name' => 'Iniciación A', 'level' => 'beginner', 'teacherId' => $teacher, 'days' => ['mon', 'wed'], 'start' => '17:00', 'end' => '18:00', 'classroom' => 1, 'capacity' => 12]);
        $this->group = $this->id();
        $this->json('POST', '/api/admin/students', ['fullName' => 'Héctor Pérez Ratkovsky', 'birthDate' => '2016-09-19', 'guardians' => [['name' => 'Lenka', 'phone' => '699615279']], 'imageConsent' => true, 'groupIds' => [$this->group]]);
        $this->hector = $this->id();
    }

    public function test_should_preview_matches_and_proposals_without_saving(): void
    {
        $this->json('POST', '/api/admin/import/preview', ['text' => self::SHEET]);

        self::assertResponseIsSuccessful();
        $rows = $this->rows();
        self::assertCount(4, $rows);
        $match = $rows[0]['match'] ?? null;
        self::assertIsArray($match);
        self::assertSame($this->hector, $match['id'] ?? null, 'coincide sin tildes');
        self::assertNull($rows[1]['match'] ?? null);
        self::assertSame('2017-02-07', $rows[1]['birthDate'] ?? null);
        self::assertSame([$this->seasonStart => 2000], $rows[1]['monthlyCents'] ?? null);
        self::assertSame(2500, $rows[1]['kitCents'] ?? null);
        $suggestions = $rows[2]['suggestions'] ?? null;
        self::assertIsArray($suggestions);
        self::assertIsArray($suggestions[0] ?? null);
        self::assertSame('Héctor Pérez Ratkovsky', $suggestions[0]['fullName'] ?? null, 'parecido por apellido');
        $this->client->request('GET', '/api/admin/students?filter=all');
        self::assertSame(1, $this->responseBody()['total'] ?? null, 'la revisión no guarda nada');
    }

    public function test_should_import_each_row_on_its_own_as_an_undoable_action(): void
    {
        $this->importRow(['line' => 2, 'action' => 'link', 'studentId' => $this->hector]);
        self::assertResponseIsSuccessful();
        self::assertSame(['line' => 2, 'action' => 'link', 'studentId' => $this->hector, 'studentName' => 'Hector Perez Ratkovsky', 'payments' => 3, 'member' => true, 'entries' => 0], $this->responseBody());

        $this->importRow(['line' => 3, 'action' => 'create', 'groupIds' => [$this->group], 'guardianName' => 'Torcuato Requena']);
        self::assertResponseIsSuccessful();
        $result = $this->responseBody();
        self::assertSame(2, $result['payments'] ?? null);
        self::assertSame(1, $result['entries'] ?? null);
        $julioId = $result['studentId'] ?? null;
        self::assertIsString($julioId);

        $this->client->request('GET', '/api/admin/students/'.$julioId);
        $detail = $this->responseBody();
        self::assertSame($this->seasonStart.'-01', $detail['joinedOn'] ?? null);
        self::assertSame([['name' => 'Torcuato Requena', 'phone' => '690 66 60 05']], $detail['guardians'] ?? null);
        $this->client->request('GET', '/api/admin/billing/accounts/'.$julioId);
        self::assertTrue($this->responseBody()['member'] ?? null);
        $this->client->request('GET', '/api/admin/accounting/ledger?month='.$this->seasonStart);
        self::assertContains('Chándal y polo · Julio Requena Montenegro', array_column((array) ($this->responseBody()['items'] ?? []), 'concept'));

        $this->client->request('GET', '/api/admin/audit/actions');
        $actions = $this->responseBody()['items'] ?? null;
        self::assertIsArray($actions);
        self::assertSame(['Importar fila de la hoja: Julio Requena Montenegro', 'Importar fila de la hoja: Hector Perez Ratkovsky'], \array_slice(array_column($actions, 'label'), 0, 2));
        $latest = $actions[0] ?? null;
        self::assertIsArray($latest);
        $latestId = $latest['id'] ?? null;
        self::assertIsString($latestId);
        $this->json('POST', '/api/admin/audit/actions/'.$latestId.'/undo');
        self::assertResponseStatusCodeSame(204);
        $this->client->request('GET', '/api/admin/students?filter=all');
        self::assertSame(1, $this->responseBody()['total'] ?? null, 'solo se deshace la fila de Julio');
        $this->client->request('GET', '/api/admin/billing/payments?studentId='.$this->hector);
        self::assertCount(3, (array) ($this->responseBody()['items'] ?? []), 'la fila de Héctor sigue importada');
    }

    public function test_should_warn_about_a_possible_duplicate_before_creating(): void
    {
        $this->importRow(['line' => 4, 'action' => 'create', 'groupIds' => [$this->group]]);

        $this->assertError(409, 'possible_duplicate');
        self::assertStringContainsString('Héctor Pérez Ratkovsky', $this->errorMessage());
        self::assertSame($this->hector, $this->errorDetails()['candidates'] ?? null);

        $this->importRow(['line' => 4, 'action' => 'create', 'groupIds' => [$this->group], 'confirmDuplicate' => true]);
        self::assertResponseIsSuccessful();
        $this->client->request('GET', '/api/admin/students?filter=all');
        self::assertSame(2, $this->responseBody()['total'] ?? null);
    }

    public function test_should_fail_only_the_bad_row_and_save_nothing_of_it(): void
    {
        $this->importRow(['line' => 5, 'action' => 'create', 'groupIds' => [$this->group]]);
        $this->assertError(422, 'missing_contact');

        $this->importRow(['line' => 2, 'action' => 'link', 'studentId' => $this->hector]);
        self::assertResponseIsSuccessful();
        $this->client->request('GET', '/api/admin/students?filter=all');
        self::assertSame(1, $this->responseBody()['total'] ?? null);
    }

    /** @param array<string, mixed> $row */
    private function importRow(array $row): void
    {
        $this->json('POST', '/api/admin/import/rows', ['text' => self::SHEET, 'row' => $row]);
    }

    private function id(): string
    {
        $id = $this->responseBody()['id'] ?? null;
        self::assertIsString($id);

        return $id;
    }

    /** @return list<array<string, mixed>> */
    private function rows(): array
    {
        $rows = $this->responseBody()['rows'] ?? null;
        self::assertIsArray($rows);

        /** @var list<array<string, mixed>> $rows */
        return $rows;
    }
}

<?php

declare(strict_types=1);

namespace App\Tests\Application\Import;

use App\Application\Import\SpreadsheetParser;
use App\Domain\Common\LocalDate;
use PHPUnit\Framework\TestCase;

final class SpreadsheetParserTest extends TestCase
{
    private const string SHEET = <<<'CSV'
        ,Fotos,,Cuota Anual,Chandal y polo,Federativa,Septiembre,Octubre,Noviembre,Diciembre,Enero,Febrero,Marzo,Abril,Mayo,Junio,Fecha Nacimiento,Madre ó Padre,Telefono,e-mail
        Julio Requena Montenegro,,,50,,,20,,,,,,,,,,7/2/17,Torcuato,690666005,torcuato@ejemplo.com
        Hector Perez Ratkovsky,,Tarjetero,50,,,55,55,,,,,,,,,19/9/2016,Lenka,699615279,lenka@ejemplo.com
        Martin Clemente Muñoz,,Bco.Santander,,,,,,,,,,,,,,11/8/2017,Luis,678810154,lclemor@ejemplo.com
        Alvaro Lopez Rivas,,,50,,,"49,5","49,5","49,5",,,,,,,,,,,
        Angel Zufri Gonzalez,,,50,,25,,36,36,36,,,,,,,30/5/2015,Susana y Gilberto,659049176,susigr_7@ejemplo.com
        Jose del Castillo Lindez,,,,,,,,,,,,,,,,29/1/2016,Encarnacion,653195878,jldelcastillo@ejemplo.com
        ,,,,,,,,,,,,,,,,,,,
        CSV;

    public function test_should_read_students_payments_and_contact_from_a_csv_export(): void
    {
        $rows = new SpreadsheetParser()->parse(self::SHEET, LocalDate::fromString('2026-10-05'));

        self::assertCount(6, $rows);
        $julio = $rows[0];
        self::assertSame(2, $julio->line);
        self::assertSame('Julio Requena Montenegro', $julio->fullName);
        self::assertSame('2017-02-07', $julio->birthDate);
        self::assertSame('Torcuato', $julio->guardianName);
        self::assertSame('690666005', $julio->guardianPhone);
        self::assertSame('torcuato@ejemplo.com', $julio->email);
        self::assertSame(5000, $julio->membershipCents);
        self::assertSame(['2026-09' => 2000], $julio->monthlyCents);
        self::assertSame([], $julio->warnings);

        self::assertSame(['2026-09' => 5500, '2026-10' => 5500], $rows[1]->monthlyCents);
        self::assertSame('2016-09-19', $rows[1]->birthDate);
        self::assertSame(['2026-09' => 4950, '2026-10' => 4950, '2026-11' => 4950], $rows[3]->monthlyCents);
        self::assertSame(2500, $rows[4]->federationCents);
        self::assertSame('Susana y Gilberto', $rows[4]->guardianName);
    }

    public function test_should_place_january_to_june_in_the_following_year(): void
    {
        $sheet = "Nombre,Septiembre,Enero,Junio\nAna Prueba,10,20,30";

        $row = new SpreadsheetParser()->parse($sheet, LocalDate::fromString('2027-02-01'))[0];

        self::assertSame(['2026-09' => 1000, '2027-01' => 2000, '2027-06' => 3000], $row->monthlyCents);
    }

    public function test_should_accept_pasted_cells_and_semicolons_and_warn_about_bad_values(): void
    {
        $pasted = "Nombre\tSeptiembre\tFecha Nacimiento\tTelefono\te-mail\nLuis Prueba\tveinte\t31/13/2015\t12345\tsin-arroba\n";
        $semicolon = "Nombre;Septiembre;Fecha Nacimiento\nMarta Prueba;\"49,5\";2/4/2011";

        $luis = new SpreadsheetParser()->parse($pasted, LocalDate::fromString('2026-10-05'))[0];
        $marta = new SpreadsheetParser()->parse($semicolon, LocalDate::fromString('2026-10-05'))[0];

        self::assertSame([], $luis->monthlyCents);
        self::assertNull($luis->birthDate);
        self::assertNull($luis->guardianPhone);
        self::assertNull($luis->email);
        self::assertCount(4, $luis->warnings);
        self::assertSame(['2026-09' => 4950], $marta->monthlyCents);
        self::assertSame('2011-04-02', $marta->birthDate);
    }

    public function test_should_fail_clearly_without_a_recognisable_header(): void
    {
        $this->expectException(\App\Domain\Common\InvalidValue::class);

        new SpreadsheetParser()->parse("a,b,c\n1,2,3", LocalDate::fromString('2026-10-05'));
    }
}

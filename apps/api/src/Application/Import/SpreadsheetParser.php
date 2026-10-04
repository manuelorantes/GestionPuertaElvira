<?php

declare(strict_types=1);

namespace App\Application\Import;

use App\Domain\Common\EmailAddress;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\PhoneNumber;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;
use Normalizer;

/**
 * Lee la hoja del club (CSV con coma o punto y coma, o celdas pegadas con tabulador).
 * Reconoce las columnas por su cabecera; la primera columna es el nombre. Fotos, Tarjetero y banco se ignoran.
 */
final readonly class SpreadsheetParser
{
    private const array MONTHS = ['septiembre' => 9, 'octubre' => 10, 'noviembre' => 11, 'diciembre' => 12, 'enero' => 1, 'febrero' => 2, 'marzo' => 3, 'abril' => 4, 'mayo' => 5, 'junio' => 6];

    /** @return list<ImportedRow> */
    public function parse(string $text, LocalDate $today): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($text)) ?: [];
        $delimiter = self::delimiter($text);
        $header = null;
        $rows = [];
        foreach ($lines as $index => $line) {
            $cells = array_map(static fn (?string $cell): string => trim((string) $cell), str_getcsv($line, $delimiter, '"', ''));
            if (null === $header) {
                if (self::looksLikeHeader($cells)) {
                    $header = self::columns($cells);
                }
                continue;
            }
            if ('' === ($cells[0] ?? '')) {
                continue;
            }
            $rows[] = $this->row($index + 1, $cells, $header, $today);
        }
        if (null === $header) {
            throw new InvalidValue('text', 'No se reconoce la cabecera: hace falta una fila con «Septiembre» o «Fecha de nacimiento».');
        }

        return $rows;
    }

    /**
     * @param list<string>       $cells
     * @param array<string, int> $columns
     */
    private function row(int $line, array $cells, array $columns, LocalDate $today): ImportedRow
    {
        $warnings = [];
        $cell = static fn (string $key): string => isset($columns[$key]) ? ($cells[$columns[$key]] ?? '') : '';
        $amount = static function (string $key) use ($cell, &$warnings): ?int {
            $raw = $cell($key);
            if ('' === $raw) {
                return null;
            }
            $cents = self::cents($raw);
            if (null === $cents) {
                $warnings[] = \sprintf('«%s» no es un importe (%s).', $raw, $key);
            }

            return $cents;
        };

        $season = Season::containing(YearMonth::of($today));
        $monthly = [];
        foreach (self::MONTHS as $name => $number) {
            $cents = $amount($name);
            if (null !== $cents && $cents > 0) {
                $monthly[\sprintf('%04d-%02d', $number >= 9 ? $season->startYear : $season->startYear + 1, $number)] = $cents;
            }
        }

        $birth = self::date($cell('birth'), $today);
        if ('' !== $cell('birth') && null === $birth) {
            $warnings[] = \sprintf('«%s» no es una fecha de nacimiento válida.', $cell('birth'));
        }
        $phone = null;
        if ('' !== $cell('phone')) {
            try {
                $phone = (string) preg_replace('/\D/', '', PhoneNumber::fromString($cell('phone'))->value);
            } catch (InvalidValue) {
                $warnings[] = \sprintf('«%s» no es un teléfono válido.', $cell('phone'));
            }
        }
        $email = null;
        if ('' !== $cell('email')) {
            try {
                $email = EmailAddress::fromString($cell('email'))->value;
            } catch (InvalidValue) {
                $warnings[] = \sprintf('«%s» no es un email válido.', $cell('email'));
            }
        }

        return new ImportedRow(
            $line,
            trim((string) preg_replace('/\s+/u', ' ', $cells[0] ?? '')),
            $birth,
            '' === $cell('guardian') ? null : $cell('guardian'),
            $phone,
            $email,
            $amount('membership'),
            $amount('kit'),
            $amount('federation'),
            $monthly,
            $warnings,
        );
    }

    /** @param list<string> $cells */
    private static function looksLikeHeader(array $cells): bool
    {
        $joined = self::normalise(implode(' ', $cells));

        return str_contains($joined, 'septiembre') || str_contains($joined, 'nacimien');
    }

    /**
     * @param list<string> $cells
     *
     * @return array<string, int> clave lógica → índice de columna
     */
    private static function columns(array $cells): array
    {
        $columns = [];
        foreach ($cells as $index => $raw) {
            $h = self::normalise($raw);
            $key = match (true) {
                '' === $h => null,
                isset(self::MONTHS[$h]) => $h,
                str_contains($h, 'cuota') => 'membership',
                str_contains($h, 'polo') || str_contains($h, 'chandal') => 'kit',
                str_contains($h, 'federa') => 'federation',
                str_contains($h, 'nacimien') => 'birth',
                str_contains($h, 'madre') || str_contains($h, 'padre') || str_contains($h, 'tutor') => 'guardian',
                str_contains($h, 'telef') || str_contains($h, 'movil') => 'phone',
                str_contains($h, 'mail') => 'email',
                default => null,
            };
            if (null !== $key && !isset($columns[$key])) {
                $columns[$key] = $index;
            }
        }

        return $columns;
    }

    private static function delimiter(string $text): string
    {
        if (str_contains($text, "\t")) {
            return "\t";
        }

        return substr_count($text, ';') > substr_count($text, ',') ? ';' : ',';
    }

    /** «49,5» o «49.50» (con o sin €) → céntimos; null si no es un número. */
    private static function cents(string $raw): ?int
    {
        $clean = str_replace([' ', '€'], '', $raw);
        if (1 === preg_match('/^\d{1,3}(\.\d{3})+(,\d+)?$/', $clean)) {
            $clean = str_replace('.', '', $clean);
        }
        $clean = str_replace(',', '.', $clean);

        return is_numeric($clean) ? (int) round((float) $clean * 100) : null;
    }

    /** «7/2/17», «30/5/2015» o «2015-05-30» → ISO; los años de dos cifras son del siglo actual si no quedan en el futuro. */
    private static function date(string $raw, LocalDate $today): ?string
    {
        if (1 === preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
            return self::validDate($raw);
        }
        if (1 !== preg_match('#^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$#', $raw, $m)) {
            return null;
        }
        $year = (int) $m[3];
        if ($year < 100) {
            $century = (int) substr($today->toString(), 0, 2) * 100;
            $year += $century;
            if ($year > (int) substr($today->toString(), 0, 4)) {
                $year -= 100;
            }
        }

        return self::validDate(\sprintf('%04d-%02d-%02d', $year, (int) $m[2], (int) $m[1]));
    }

    private static function validDate(string $iso): ?string
    {
        try {
            return LocalDate::fromString($iso)->toString();
        } catch (InvalidValue) {
            return null;
        }
    }

    public static function normalise(string $text): string
    {
        $lower = mb_strtolower(trim($text));
        $decomposed = Normalizer::normalize($lower, Normalizer::FORM_D);

        return trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/\p{Mn}+/u', '', \is_string($decomposed) ? $decomposed : $lower)));
    }
}

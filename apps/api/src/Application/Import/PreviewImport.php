<?php

declare(strict_types=1);

namespace App\Application\Import;

use App\Application\Import\Port\StudentMatcher;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;

/** Lee la hoja y la casa con los alumnos existentes, sin guardar nada. */
final readonly class PreviewImport
{
    public function __construct(private SpreadsheetParser $parser, private StudentMatcher $students, private Clock $clock)
    {
    }

    /** @return list<ImportPreviewRow> */
    public function __invoke(string $text): array
    {
        $today = LocalDate::fromInstant($this->clock->now());

        return array_map(function (ImportedRow $row): ImportPreviewRow {
            $match = $this->students->byName($row->fullName);

            return new ImportPreviewRow($row, $match, null === $match ? $this->students->similar($row->fullName) : []);
        }, $this->parser->parse($text, $today));
    }
}

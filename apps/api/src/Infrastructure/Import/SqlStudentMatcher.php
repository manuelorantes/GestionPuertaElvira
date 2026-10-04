<?php

declare(strict_types=1);

namespace App\Infrastructure\Import;

use App\Application\Import\Port\StudentMatcher;
use App\Application\Import\SpreadsheetParser;
use App\Application\Import\StudentCandidate;
use App\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;

/** Coincidencia por nombre normalizado (`search_name`) y parecido por palabras en común. */
final readonly class SqlStudentMatcher implements StudentMatcher
{
    private const int SUGGESTIONS = 3;

    public function __construct(private Connection $connection)
    {
    }

    public function byName(string $fullName): ?StudentCandidate
    {
        $row = $this->connection->fetchAssociative(
            'SELECT id, full_name FROM students_student WHERE search_name = :name ORDER BY withdrawn_on NULLS FIRST LIMIT 1',
            ['name' => SpreadsheetParser::normalise($fullName)],
        );

        return false === $row ? null : self::candidate($row);
    }

    public function similar(string $fullName): array
    {
        $tokens = array_values(array_filter(explode(' ', SpreadsheetParser::normalise($fullName)), static fn (string $t): bool => mb_strlen($t) >= 3));
        if ([] === $tokens) {
            return [];
        }
        $scored = [];
        foreach ($this->connection->fetchAllAssociative('SELECT id, full_name, search_name FROM students_student') as $values) {
            $row = new Row($values);
            $words = explode(' ', $row->string('search_name'));
            $score = \count(array_intersect($tokens, $words));
            if ($score > 0) {
                $scored[] = [$score, $row->string('full_name'), self::candidate($values)];
            }
        }
        usort($scored, static fn (array $a, array $b): int => [$b[0], $a[1]] <=> [$a[0], $b[1]]);

        return array_map(static fn (array $s): StudentCandidate => $s[2], \array_slice($scored, 0, self::SUGGESTIONS));
    }

    public function exists(string $studentId): bool
    {
        return false !== $this->connection->fetchOne('SELECT 1 FROM students_student WHERE id = :id::uuid', ['id' => $studentId]);
    }

    /** @param array<string, mixed> $values */
    private static function candidate(array $values): StudentCandidate
    {
        $row = new Row($values);

        return new StudentCandidate($row->string('id'), $row->string('full_name'));
    }
}

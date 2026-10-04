<?php

declare(strict_types=1);

namespace App\Application\Import;

/** Lo que administración decide para una fila: vincular a un alumno, crear uno (con los datos revisados) u omitir. */
final readonly class ImportDecision
{
    public const string LINK = 'link';
    public const string CREATE = 'create';
    public const string SKIP = 'skip';

    /** @param list<string> $groupIds */
    public function __construct(
        public int $line,
        public string $action,
        public ?string $studentId = null,
        public array $groupIds = [],
        public ?string $fullName = null,
        public ?string $birthDate = null,
        public ?string $guardianName = null,
        public ?string $guardianPhone = null,
        public ?string $email = null,
    ) {
    }
}

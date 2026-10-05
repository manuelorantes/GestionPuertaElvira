<?php

declare(strict_types=1);

namespace App\Application\Import\Error;

use App\Application\Import\StudentCandidate;
use App\Domain\Common\HasErrorDetails;
use RuntimeException;

/** Antes de crear un alumno se avisa de que ya hay uno parecido; se puede vincular o crear igualmente. */
final class PossibleDuplicate extends RuntimeException implements HasErrorDetails
{
    /** @param non-empty-list<StudentCandidate> $candidates */
    public function __construct(public readonly array $candidates)
    {
        parent::__construct(\sprintf('Posible duplicado: ya existe «%s». Vincula la fila a ese alumno o confirma que es otra persona.', $candidates[0]->fullName));
    }

    public function details(): array
    {
        return ['candidates' => implode(', ', array_map(static fn (StudentCandidate $c): string => $c->id, $this->candidates))];
    }
}

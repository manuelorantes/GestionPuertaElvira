<?php

declare(strict_types=1);

namespace App\Application\Teachers\Error;

use App\Domain\Common\HasErrorDetails;
use RuntimeException;

final class TeacherHasGroups extends RuntimeException implements HasErrorDetails
{
    public function __construct(private readonly int $groupCount)
    {
        parent::__construct(\sprintf('No se puede desactivar: tiene %d %s asignados. Asígnalos antes a otro profesor.', $groupCount, 1 === $groupCount ? 'grupo' : 'grupos'));
    }

    public function details(): array
    {
        return ['groupCount' => $this->groupCount];
    }
}

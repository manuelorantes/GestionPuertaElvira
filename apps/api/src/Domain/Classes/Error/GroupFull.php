<?php

declare(strict_types=1);

namespace App\Domain\Classes\Error;

use App\Domain\Common\HasErrorDetails;
use DomainException;

final class GroupFull extends DomainException implements HasErrorDetails
{
    public function __construct(private readonly int $occupied, private readonly int $capacity)
    {
        parent::__construct(\sprintf('El grupo está completo (%d/%d).', $occupied, $capacity));
    }

    public function details(): array
    {
        return ['occupied' => $this->occupied, 'capacity' => $this->capacity];
    }
}

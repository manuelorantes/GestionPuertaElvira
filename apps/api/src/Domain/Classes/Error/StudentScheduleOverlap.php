<?php

declare(strict_types=1);

namespace App\Domain\Classes\Error;

use App\Domain\Classes\ClassGroup;
use App\Domain\Common\HasErrorDetails;
use DomainException;

final class StudentScheduleOverlap extends DomainException implements HasErrorDetails
{
    public function __construct(private readonly ClassGroup $conflicting)
    {
        parent::__construct(\sprintf(
            'Coincide en horario con «%s» (%s), en el que ya está inscrito.',
            $conflicting->details()->name->value,
            $conflicting->details()->slot->label(),
        ));
    }

    public function details(): array
    {
        return [
            'groupId' => $this->conflicting->id()->value,
            'groupName' => $this->conflicting->details()->name->value,
            'slotLabel' => $this->conflicting->details()->slot->label(),
        ];
    }
}

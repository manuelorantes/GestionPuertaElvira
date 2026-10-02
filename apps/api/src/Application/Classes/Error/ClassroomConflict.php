<?php

declare(strict_types=1);

namespace App\Application\Classes\Error;

use App\Domain\Classes\ClassGroup;
use App\Domain\Common\HasErrorDetails;
use RuntimeException;

final class ClassroomConflict extends RuntimeException implements HasErrorDetails
{
    public function __construct(private readonly ClassGroup $conflicting)
    {
        $details = $conflicting->details();
        parent::__construct(\sprintf(
            'Coincide en el aula %d con «%s» (%s).',
            $details->classroom->number,
            $details->name->value,
            $details->slot->label(),
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

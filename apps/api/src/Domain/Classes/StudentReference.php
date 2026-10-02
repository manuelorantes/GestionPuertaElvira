<?php

declare(strict_types=1);

namespace App\Domain\Classes;

use App\Domain\Common\Uuid;

/** Identificador del alumno inscrito (el alumno vive en el contexto de Alumnado). */
final readonly class StudentReference extends Uuid
{
}

<?php

declare(strict_types=1);

namespace App\Domain\Classes;

use App\Domain\Common\Uuid;

/** Identificador del profesor de un grupo (el profesor vive en el contexto de Profesorado). */
final readonly class TeacherReference extends Uuid
{
}

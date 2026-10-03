<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Application\Payroll\Port\TeacherRates;
use App\Domain\Common\InvalidValue;
use App\Domain\Payroll\TeacherRef;

/** Las sesiones solo se apuntan a profesores que existen (si no, desaparecerían de todas las vistas). */
final class TeacherCheck
{
    public static function ensureExists(TeacherRates $teachers, TeacherRef $teacher): void
    {
        foreach ($teachers->all() as $rate) {
            if ($rate->id === $teacher->value) {
                return;
            }
        }

        throw new InvalidValue('teacherId', 'Ese profesor no existe.');
    }
}

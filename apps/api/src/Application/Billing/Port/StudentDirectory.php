<?php

declare(strict_types=1);

namespace App\Application\Billing\Port;

use App\Application\Billing\BillingStudent;
use App\Domain\Billing\StudentRef;
use App\Domain\Billing\YearMonth;
use App\Domain\Common\LocalDate;

interface StudentDirectory
{
    /**
     * Alumnos con alta en algún día del mes.
     *
     * @return list<BillingStudent>
     */
    public function activeIn(YearMonth $month): array;

    /** Perfil del alumno con sus grupos en ese día. */
    public function find(StudentRef $student, LocalDate $day): ?BillingStudent;
}

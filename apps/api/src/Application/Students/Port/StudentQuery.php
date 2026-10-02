<?php

declare(strict_types=1);

namespace App\Application\Students\Port;

use App\Application\Students\StudentDetail;
use App\Application\Students\StudentFilter;
use App\Application\Students\StudentSummary;
use App\Domain\Common\LocalDate;

interface StudentQuery
{
    /** @return list<StudentSummary> ordenados por nombre */
    public function list(StudentFilter $filter, ?string $search, LocalDate $on): array;

    public function total(): int;

    public function detail(string $id, LocalDate $on): ?StudentDetail;
}

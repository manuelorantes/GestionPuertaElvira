<?php

declare(strict_types=1);

namespace App\Application\Classes\Port;

use App\Application\Classes\GroupSummary;
use App\Domain\Common\LocalDate;

interface ClassQuery
{
    /** @return list<GroupSummary> ordenados por primer día de la semana, hora de inicio y aula */
    public function groups(LocalDate $on): array;

    public function group(string $id, LocalDate $on): ?GroupSummary;

    /** @return list<array{id: string, fullName: string, age: int}> */
    public function enrolledStudents(string $groupId, LocalDate $on): array;
}

<?php

declare(strict_types=1);

namespace App\Application\Teachers;

use App\Application\Teachers\Port\TeacherRepository;
use App\Domain\Common\Money;

final readonly class ChangeTeacherRate
{
    public function __construct(private TeacherRepository $teachers)
    {
    }

    public function __invoke(string $id, string $hourlyRate): void
    {
        $teacher = TeacherLookup::byId($this->teachers, $id);
        $teacher->changeRate(Money::fromDecimal($hourlyRate));
        $this->teachers->save($teacher);
    }
}

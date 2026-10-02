<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Classes;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'classes_group')]
#[ORM\Index(name: 'classes_group_teacher_idx', columns: ['teacher_id'])]
class ClassGroupRecord
{
    /** @param list<int> $days ISO weekday numbers (1 = lunes) */
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $id,
        #[ORM\Column(length: 60)]
        public string $name,
        #[ORM\Column(length: 20)]
        public string $level,
        #[ORM\Column(type: Types::GUID)]
        public string $teacherId,
        #[ORM\Column(type: Types::JSON)]
        public array $days,
        #[ORM\Column(type: Types::SMALLINT)]
        public int $startMinutes,
        #[ORM\Column(type: Types::SMALLINT)]
        public int $endMinutes,
        #[ORM\Column(type: Types::SMALLINT)]
        public int $classroom,
        #[ORM\Column(type: Types::SMALLINT)]
        public int $capacity,
    ) {
    }
}

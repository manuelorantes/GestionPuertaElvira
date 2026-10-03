<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Teachers;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'teachers_teacher')]
class TeacherRecord
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $id,
        #[ORM\Column(length: 120)]
        public string $fullName,
        #[ORM\Column]
        public bool $active,
        #[ORM\Column(options: ['default' => 1500])]
        public int $hourlyRateCents = 1500,
    ) {
    }
}

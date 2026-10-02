<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Model\Classes;

use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'classes_enrolment')]
#[ORM\Index(name: 'classes_enrolment_student_idx', columns: ['student_id'])]
#[ORM\Index(name: 'classes_enrolment_group_idx', columns: ['class_group_id'])]
class EnrolmentRecord
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column(type: Types::GUID)]
        public string $id,
        #[ORM\Column(type: Types::GUID)]
        public string $studentId,
        #[ORM\Column(type: Types::GUID)]
        public string $classGroupId,
        #[ORM\Column(type: Types::DATE_IMMUTABLE)]
        public DateTimeImmutable $enrolledOn,
        #[ORM\Column(type: Types::DATE_IMMUTABLE, nullable: true)]
        public ?DateTimeImmutable $endsOn,
    ) {
    }
}

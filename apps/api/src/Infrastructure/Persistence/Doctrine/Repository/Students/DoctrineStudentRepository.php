<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Students;

use App\Application\Students\Port\StudentRepository;
use App\Domain\Common\EmailAddress;
use App\Domain\Common\FullName;
use App\Domain\Common\PhoneNumber;
use App\Domain\Students\FederationLicence;
use App\Domain\Students\Guardian;
use App\Domain\Students\NationalId;
use App\Domain\Students\Student;
use App\Domain\Students\StudentDetails;
use App\Domain\Students\StudentId;
use App\Infrastructure\Persistence\Doctrine\LocalDateMapping;
use App\Infrastructure\Persistence\Doctrine\Model\Students\StudentRecord;
use App\Infrastructure\Persistence\Doctrine\SearchText;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineStudentRepository implements StudentRepository
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function find(StudentId $id): ?Student
    {
        $record = $this->em->find(StudentRecord::class, $id->value);

        return null === $record ? null : self::toDomain($record);
    }

    public function save(Student $student): void
    {
        $d = $student->details();
        $record = $this->em->find(StudentRecord::class, $student->id()->value);
        $values = [
            'fullName' => $d->fullName->value,
            'searchName' => SearchText::normalise($d->fullName->value),
            'birthDate' => LocalDateMapping::toColumn($d->birthDate),
            'nationalId' => $d->nationalId?->value,
            'contactEmail' => $d->contactEmail?->value,
            'guardians' => array_map(static fn (Guardian $g): array => ['name' => $g->name->value, 'phone' => $g->phone->value], $d->guardians),
            'ownPhone' => $d->ownPhone?->value,
            'federationLicence' => $d->federationLicence?->value,
            'imageConsent' => $d->imageConsent,
            'withdrawnOn' => null === $student->withdrawnOn() ? null : LocalDateMapping::toColumn($student->withdrawnOn()),
            'siblingIds' => array_map(static fn (StudentId $id): string => $id->value, $student->siblings()),
        ];

        if (null === $record) {
            $record = new StudentRecord($student->id()->value, $values['fullName'], $values['searchName'], $values['birthDate'], $values['nationalId'], $values['contactEmail'], $values['guardians'], $values['ownPhone'], $values['federationLicence'], $values['imageConsent'], LocalDateMapping::toColumn($student->joinedOn()), $values['withdrawnOn'], $values['siblingIds']);
        } else {
            foreach ($values as $property => $value) {
                $record->{$property} = $value;
            }
        }

        $this->em->persist($record);
        $this->em->flush();
    }

    private static function toDomain(StudentRecord $r): Student
    {
        return Student::restore(
            StudentId::fromString($r->id),
            new StudentDetails(
                FullName::fromString($r->fullName),
                LocalDateMapping::fromColumn($r->birthDate),
                null === $r->nationalId ? null : NationalId::fromString($r->nationalId),
                null === $r->contactEmail ? null : EmailAddress::fromString($r->contactEmail),
                array_map(static fn (array $g): Guardian => new Guardian(FullName::fromString($g['name']), PhoneNumber::fromString($g['phone'])), $r->guardians),
                null === $r->ownPhone ? null : PhoneNumber::fromString($r->ownPhone),
                null === $r->federationLicence ? null : FederationLicence::fromString($r->federationLicence),
                $r->imageConsent,
            ),
            LocalDateMapping::fromColumn($r->joinedOn),
            null === $r->withdrawnOn ? null : LocalDateMapping::fromColumn($r->withdrawnOn),
            array_map(StudentId::fromString(...), $r->siblingIds),
        );
    }
}

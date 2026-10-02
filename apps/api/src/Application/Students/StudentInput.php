<?php

declare(strict_types=1);

namespace App\Application\Students;

use App\Domain\Common\EmailAddress;
use App\Domain\Common\FullName;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\PhoneNumber;
use App\Domain\Students\FederationLicence;
use App\Domain\Students\Guardian;
use App\Domain\Students\NationalId;
use App\Domain\Students\StudentDetails;

/**
 * Datos personales de un alumno tal y como llegan del exterior; toDetails() los valida.
 */
final readonly class StudentInput
{
    /** @param list<array{name: string, phone: string}> $guardians */
    public function __construct(
        public string $fullName,
        public string $birthDate,
        public ?string $nationalId,
        public ?string $contactEmail,
        public array $guardians,
        public ?string $ownPhone,
        public ?string $federationLicence,
        public bool $imageConsent,
    ) {
    }

    public function toDetails(): StudentDetails
    {
        return new StudentDetails(
            FullName::fromString($this->fullName),
            self::birthDate($this->birthDate),
            null === $this->nationalId ? null : NationalId::fromString($this->nationalId),
            null === $this->contactEmail ? null : EmailAddress::fromString($this->contactEmail),
            array_map(static fn (array $guardian): Guardian => new Guardian(FullName::fromString($guardian['name']), PhoneNumber::fromString($guardian['phone'])), $this->guardians),
            null === $this->ownPhone ? null : PhoneNumber::fromString($this->ownPhone),
            null === $this->federationLicence ? null : FederationLicence::fromString($this->federationLicence),
            $this->imageConsent,
        );
    }

    private static function birthDate(string $value): LocalDate
    {
        try {
            return LocalDate::fromString($value);
        } catch (InvalidValue) {
            throw new InvalidValue('birthDate', 'La fecha de nacimiento no es válida.');
        }
    }
}

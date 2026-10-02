<?php

declare(strict_types=1);

namespace App\Domain\Students;

use App\Domain\Common\EmailAddress;
use App\Domain\Common\FullName;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\PhoneNumber;

/**
 * Datos personales editables de un alumno.
 */
final readonly class StudentDetails
{
    private const int MAX_GUARDIANS = 2;

    /** @param list<Guardian> $guardians */
    public function __construct(
        public FullName $fullName,
        public LocalDate $birthDate,
        public ?NationalId $nationalId,
        public ?EmailAddress $contactEmail,
        public array $guardians,
        public ?PhoneNumber $ownPhone,
        public ?FederationLicence $federationLicence,
        public bool $imageConsent,
    ) {
        if (\count($guardians) > self::MAX_GUARDIANS) {
            throw new InvalidValue('guardians', 'Un alumno puede tener como mucho dos tutores.');
        }
    }

    public function isMinorOn(LocalDate $day): bool
    {
        return $this->birthDate->ageOn($day) < 18;
    }
}

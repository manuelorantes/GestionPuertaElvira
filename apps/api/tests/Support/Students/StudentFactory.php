<?php

declare(strict_types=1);

namespace App\Tests\Support\Students;

use App\Domain\Common\EmailAddress;
use App\Domain\Common\FullName;
use App\Domain\Common\LocalDate;
use App\Domain\Common\PhoneNumber;
use App\Domain\Students\Guardian;
use App\Domain\Students\StudentDetails;

final class StudentFactory
{
    /** @param list<Guardian>|null $guardians */
    public static function details(
        string $name = 'Martina López Herrera',
        string $birthDate = '2014-03-12',
        ?array $guardians = null,
        ?string $ownPhone = null,
        ?string $licence = null,
        bool $imageConsent = true,
    ): StudentDetails {
        return new StudentDetails(
            FullName::fromString($name),
            LocalDate::fromString($birthDate),
            null,
            EmailAddress::fromString('familia@ejemplo.com'),
            $guardians ?? [new Guardian(FullName::fromString('Rocío Herrera'), PhoneNumber::fromString('612481930'))],
            null === $ownPhone ? null : PhoneNumber::fromString($ownPhone),
            null === $licence ? null : \App\Domain\Students\FederationLicence::fromString($licence),
            $imageConsent,
        );
    }
}

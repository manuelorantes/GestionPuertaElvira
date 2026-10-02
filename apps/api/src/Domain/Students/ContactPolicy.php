<?php

declare(strict_types=1);

namespace App\Domain\Students;

use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Students\Error\MissingContact;

/**
 * Siempre debe haber a quién llamar: un menor necesita un tutor; un adulto sin tutor, su teléfono.
 */
final readonly class ContactPolicy
{
    private const int MAX_AGE = 100;

    public function assertAcceptable(StudentDetails $details, LocalDate $today): void
    {
        if ($today->isBefore($details->birthDate)) {
            throw new InvalidValue('birthDate', 'La fecha de nacimiento no puede ser futura.');
        }
        if ($details->birthDate->ageOn($today) > self::MAX_AGE) {
            throw new InvalidValue('birthDate', 'Revisa la fecha de nacimiento.');
        }
        if ($details->isMinorOn($today) && [] === $details->guardians) {
            throw MissingContact::minorWithoutGuardian();
        }
        if (!$details->isMinorOn($today) && [] === $details->guardians && null === $details->ownPhone) {
            throw MissingContact::adultWithoutPhone();
        }
    }
}

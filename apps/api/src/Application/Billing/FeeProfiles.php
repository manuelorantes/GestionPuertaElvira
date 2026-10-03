<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Domain\Billing\BillingSettings;
use App\Domain\Billing\FeeProfile;
use App\Domain\Billing\PrivateLesson;
use App\Domain\Billing\StudentAccount;

/** Traduce el perfil del alumno al del cálculo, con el precio pactado o el del profesor. */
final class FeeProfiles
{
    public static function of(BillingStudent $student, ?StudentAccount $account, BillingSettings $settings): FeeProfile
    {
        $lessons = array_map(
            static fn (PrivateEnrolment $e): PrivateLesson => new PrivateLesson($e->groupName, $e->weeklyHours, $account?->privateRate() ?? $settings->privateRateFor($e->teacherId)),
            $student->privateLessons,
        );

        return new FeeProfile($student->regularWeeklyHours, $lessons, $student->hasSiblings);
    }
}

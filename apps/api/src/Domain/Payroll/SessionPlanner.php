<?php

declare(strict_types=1);

namespace App\Domain\Payroll;

use App\Domain\Common\LocalDate;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;
use DateTimeImmutable;

/** Propone las sesiones de un mes a partir del horario: una por cada día de clase de cada grupo. */
final readonly class SessionPlanner
{
    /**
     * @param list<ScheduledGroup> $groups
     *
     * @return list<PlannedSession> ordenadas por fecha
     */
    public function plan(YearMonth $month, array $groups): array
    {
        if (null === Season::teachingSeason($month)) {
            return [];
        }

        $sessions = [];
        for ($day = 1; $day <= $month->days(); ++$day) {
            $date = LocalDate::fromString(\sprintf('%s-%02d', $month->toString(), $day));
            $weekday = (int) new DateTimeImmutable($date->toString())->format('N');
            foreach ($groups as $group) {
                if (\in_array($weekday, $group->weekdays, true)) {
                    $sessions[] = new PlannedSession($group, $date, SessionMinutes::fromMinutes($group->minutes));
                }
            }
        }

        return $sessions;
    }
}

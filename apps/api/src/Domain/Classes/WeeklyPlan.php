<?php

declare(strict_types=1);

namespace App\Domain\Classes;

/**
 * Modalidad de un grupo según sus horas semanales; determina la cuota (especificación de Cobros).
 */
enum WeeklyPlan: string
{
    case OneHour = 'one_hour';
    case HourAndHalf = 'hour_and_half';
    case TwoHours = 'two_hours';
    case ThreeHours = 'three_hours';
    case PrivateLesson = 'private_lesson';

    public static function for(Level $level, WeeklySlot $slot): self
    {
        if (Level::PrivateLesson === $level) {
            return self::PrivateLesson;
        }

        $hours = $slot->weeklyHours();

        return match (true) {
            $hours >= 3 => self::ThreeHours,
            $hours >= 2 => self::TwoHours,
            $hours >= 1.5 => self::HourAndHalf,
            default => self::OneHour,
        };
    }
}

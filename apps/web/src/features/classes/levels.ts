import type { Level, WeeklyPlan } from './api';

interface LevelStyle {
  label: string;
  legend: string;
  className: string;
}

/** Colores por nivel del diseño (bloques del horario, leyenda y marca en la tabla). */
export const LEVELS: Record<Level, LevelStyle> = {
  beginner: {
    label: 'Iniciación',
    legend: 'Iniciación',
    className: 'bg-brand-soft text-brand-strong border-brand-tint',
  },
  intermediate: {
    label: 'Intermedio',
    legend: 'Intermedio',
    className: 'bg-brand text-surface-raised border-brand',
  },
  advanced: {
    label: 'Avanzado',
    legend: 'Avanzado y competición',
    className: 'bg-ink-strong text-paper border-ink-strong',
  },
  juniors: {
    label: 'Peques y jóvenes',
    legend: 'Peques y jóvenes',
    className: 'bg-sand text-ink-soft border-line-strong',
  },
  adults: {
    label: 'Adultos',
    legend: 'Adultos',
    className: 'bg-sage text-brand-strong border-brand-tint',
  },
  private_lesson: {
    label: 'Particular',
    legend: 'Particulares',
    className: 'bg-surface text-ink-soft border-line-muted border-dashed',
  },
};

export const LEVEL_OPTIONS = (Object.keys(LEVELS) as Level[]).map((value) => ({
  value,
  label: LEVELS[value].label,
}));

export const WEEKLY_PLAN_LABEL: Record<WeeklyPlan, string> = {
  one_hour: '1 h semanal',
  hour_and_half: '1 h y media semanal',
  two_hours: '2 h semanales',
  three_hours: '3 h semanales',
  private_lesson: 'Particular',
};

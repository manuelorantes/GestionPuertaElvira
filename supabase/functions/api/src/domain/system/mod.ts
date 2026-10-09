import { InvalidValue } from '../common/mod.ts';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Más tarde que esto desde su hora, una ejecución correcta cuenta como «con retraso». */
export const LATE_AFTER_MINUTES = 30;
/** GitHub puede retrasar horas los workflows programados: hasta aquí un turno sin ejecución está «pendiente». */
const PENDING_FOR_MINUTES = 12 * 60;

/**
 * Horario de una tarea programada, con el subconjunto de cron de los workflows del club (en UTC): minuto y hora fijos,
 * día del mes «*» o «*\/n» (días 1, 1+n, 1+2n… de cada mes, como GitHub), y mes y día de la semana «*».
 */
export class TaskSchedule {
  private constructor(
    readonly cron: string,
    private readonly minute: number,
    private readonly hour: number,
    private readonly everyDays: number,
  ) {}

  static fromCron(cron: string): TaskSchedule {
    const match = /^(\d{1,2}) (\d{1,2}) (\*|\*\/(\d{1,2})) \* \*$/.exec(cron.trim());
    const minute = Number(match?.[1]);
    const hour = Number(match?.[2]);
    if (!match || minute > 59 || hour > 23) {
      throw new InvalidValue('cron', `Horario no soportado: ${cron}`);
    }
    return new TaskSchedule(cron, minute, hour, match[4] ? Number(match[4]) : 1);
  }

  /** Cada cuántos días (en la práctica): sirve para la ventana de un turno. */
  get days(): number {
    return this.everyDays;
  }

  private runsOn(day: Date): boolean {
    return (day.getUTCDate() - 1) % this.everyDays === 0;
  }

  private slotOn(day: Date): Date {
    return new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), this.hour, this.minute),
    );
  }

  /** El primer turno estrictamente después de `instant`. */
  nextAfter(instant: Date): Date {
    for (let day = new Date(instant.getTime());; day = new Date(day.getTime() + DAY)) {
      const slot = this.slotOn(day);
      if (this.runsOn(day) && slot > instant) return slot;
    }
  }

  /** Los últimos `count` turnos hasta `instant` (incluido), del más reciente al más antiguo. */
  slotsBefore(instant: Date, count: number): Date[] {
    const slots: Date[] = [];
    for (
      let day = new Date(instant.getTime());
      slots.length < count;
      day = new Date(day.getTime() - DAY)
    ) {
      const slot = this.slotOn(day);
      if (this.runsOn(day) && slot <= instant) slots.push(slot);
    }
    return slots;
  }
}

/** Una ejecución de la tarea, apuntada por el propio workflow al terminar. */
export interface TaskRun {
  startedAt: Date;
  finishedAt: Date | null;
  outcome: 'success' | 'failure';
  /** Lanzada a mano (Run workflow) en vez de por el horario. */
  manual: boolean;
  url: string | null;
}

export type SlotStatus = 'done' | 'late' | 'failed' | 'pending' | 'missed';

export interface SlotView {
  status: SlotStatus;
  /** Minutos desde su hora hasta que arrancó (si se ejecutó). */
  delayMinutes: number | null;
  run: TaskRun | null;
}

/**
 * Estado de un turno: la ejecución que le corresponde es la primera que arranca entre su hora y el turno siguiente.
 * Correcta en hora, «hecha»; correcta tarde, «con retraso»; con error, «falló». Sin ejecución, «pendiente» mientras
 * aún puede llegar (hasta 12 horas, sin pasar del turno siguiente) y «no se hizo» después.
 */
export function slotStatus(slot: Date, next: Date, runs: readonly TaskRun[], now: Date): SlotView {
  const run = [...runs]
    .filter((r) => r.startedAt >= slot && r.startedAt < next)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0] ?? null;
  if (run === null) {
    const deadline = Math.min(next.getTime(), slot.getTime() + PENDING_FOR_MINUTES * MINUTE);
    return {
      status: now.getTime() < deadline ? 'pending' : 'missed',
      delayMinutes: null,
      run: null,
    };
  }
  const delayMinutes = Math.round((run.startedAt.getTime() - slot.getTime()) / MINUTE);
  const status = run.outcome === 'failure'
    ? 'failed'
    : delayMinutes > LATE_AFTER_MINUTES
    ? 'late'
    : 'done';
  return { status, delayMinutes, run };
}

import type { TaskRun } from '../../domain/system/mod.ts';
import type { TaskRunLog } from '../../application/system/mod.ts';
import { Row, type Sql } from './sql.ts';

/** Ejecuciones que apuntan los workflows al terminar (tabla `system_task_run`). */
export class SqlTaskRunLog implements TaskRunLog {
  constructor(private readonly sql: Sql) {}

  async runsSince(taskId: string, since: Date): Promise<TaskRun[]> {
    const rows = await this.sql`SELECT * FROM system_task_run
      WHERE task = ${taskId} AND started_at >= ${since} ORDER BY started_at`;
    return Row.all(rows).map((r) => ({
      startedAt: r.date('started_at'),
      finishedAt: r.json('finished_at') === null ? null : r.date('finished_at'),
      outcome: r.string('outcome') === 'success' ? 'success' : 'failure',
      manual: r.bool('manual'),
      url: r.nullableString('url'),
    }));
  }
}

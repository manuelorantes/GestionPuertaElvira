import { ScheduledTasksStatus } from '../../application/system/mod.ts';
import type { ApiApp } from '../http/app.ts';
import { SqlTaskRunLog } from '../persistence/system.ts';

/** Sección Sistema (solo superadministración): /api/admin/system/* */
export function registerSystemRoutes(api: ApiApp): void {
  api.defineRoute(
    { method: 'GET', path: '/api/admin/system/tasks', access: 'superadmin' },
    async (c, scope) => {
      return c.json({
        items: await new ScheduledTasksStatus(new SqlTaskRunLog(scope.tx), api.deps.clock)
          .execute(),
      });
    },
  );
}

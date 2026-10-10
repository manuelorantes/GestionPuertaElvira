// Diagnóstico de datos desde la consola (lo lanza cada noche el workflow diagnostico.yml).
import type { Clock } from '../src/domain/common/mod.ts';
import { DiagnosisRun } from '../src/domain/diagnostics/mod.ts';
import { RunDiagnosis } from '../src/application/diagnostics/mod.ts';
import { SqlDiagnosticsFacts } from '../src/infrastructure/diagnostics/facts.ts';
import { SqlFindingRepository, SqlRunLog } from '../src/infrastructure/persistence/diagnostics.ts';
import {
  PostgresAdvisoryLocks,
  type TransactionSql,
} from '../src/infrastructure/persistence/sql.ts';

/** Ejecuta todas las reglas como «Tarea nocturna» y resume el resultado. */
export async function runDiagnosis(tx: TransactionSql, clock: Clock): Promise<string> {
  const run = await new RunDiagnosis(
    new SqlDiagnosticsFacts(tx, clock),
    new SqlFindingRepository(tx),
    new SqlRunLog(tx),
    clock,
    new PostgresAdvisoryLocks(tx),
  ).execute(DiagnosisRun.NIGHTLY);
  return `Diagnóstico terminado: ${run.openCount} hallazgos abiertos (${run.newCount} nuevos, ${run.resolvedCount} resueltos solos).`;
}

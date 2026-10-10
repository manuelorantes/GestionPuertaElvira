// Diagnóstico de datos: puertos y casos de uso. Las reglas viven en ./rules; los hechos, en ./facts.ts.
import { type Clock, generateUuidV7 } from '../../domain/common/mod.ts';
import {
  DiagnosisRun,
  type EntityRef,
  Finding,
  type FindingStatus,
  Fingerprint,
  type Fix,
  RULE_CATALOGUE,
  type RuleCode,
  ruleDefinition,
  type Severity,
} from '../../domain/diagnostics/mod.ts';
import type { Locks } from '../common/mod.ts';
import type { Candidate, Facts, FactsSource } from './facts.ts';
import { evaluateAll, ruleFor } from './rules/mod.ts';

export * from './facts.ts';

// ---- Puertos ---------------------------------------------------------------------------------

export interface FindingRepository {
  open(): Promise<Finding[]>;
  /** Huellas de los hallazgos descartados: no vuelven a salir mientras los datos sean los mismos. */
  dismissedFingerprints(): Promise<Set<string>>;
  byId(id: string): Promise<Finding | null>;
  save(finding: Finding): Promise<void>;
  saveAll(findings: Finding[]): Promise<void>;
  /** Los de un estado, de la temporada en curso. */
  list(status: FindingStatus): Promise<Finding[]>;
}

export interface RunLog {
  saveRun(run: DiagnosisRun): Promise<void>;
  lastRun(): Promise<DiagnosisRun | null>;
}

/** Aplica el arreglo de un hallazgo con los casos de uso del contexto al que pertenece. */
export interface FixExecutor {
  apply(fix: Fix): Promise<void>;
}

// ---- Errores ---------------------------------------------------------------------------------

export class FindingNotFound extends Error {
  constructor() {
    super('No existe ese hallazgo.');
    this.name = 'FindingNotFound';
  }
}

/** Los datos ya no son los del hallazgo: hay que volver a diagnosticar antes de aceptar. */
export class FindingOutdated extends Error {
  constructor() {
    super('Los datos han cambiado desde el diagnóstico; vuelve a diagnosticar.');
    this.name = 'FindingOutdated';
  }
}

// ---- Casos de uso ----------------------------------------------------------------------------

const RUN_LOCK = 'diagnostics:run';

/**
 * Ejecuta todas las reglas sobre los hechos de hoy y reconcilia con los hallazgos guardados: los nuevos nacen abiertos,
 * los que ya estaban abiertos se tocan, los descartados con la misma huella se omiten y los abiertos que ya no se
 * reproducen quedan resueltos. Nunca cambia datos del club.
 */
export class RunDiagnosis {
  constructor(
    private readonly source: FactsSource,
    private readonly findings: FindingRepository,
    private readonly runs: RunLog,
    private readonly clock: Clock,
    private readonly locks: Locks,
  ) {}

  async execute(launchedBy: string): Promise<DiagnosisRun> {
    await this.locks.acquire(RUN_LOCK);
    const startedAt = this.clock.now();
    const candidates = evaluateAll(await this.source.load());
    const open = new Map((await this.findings.open()).map((f) => [f.fingerprint.value, f]));
    const dismissed = await this.findings.dismissedFingerprints();
    const changed: Finding[] = [];
    const seen = new Set<string>();
    let created = 0;
    for (const candidate of candidates) {
      const fingerprint = Fingerprint.of(candidate.rule, candidate.entity, candidate.data);
      if (dismissed.has(fingerprint.value) || seen.has(fingerprint.value)) continue;
      seen.add(fingerprint.value);
      const existing = open.get(fingerprint.value);
      if (existing) {
        existing.touch(startedAt);
        changed.push(existing);
        continue;
      }
      changed.push(Finding.detect({ id: generateUuidV7(), ...candidate }, startedAt));
      created++;
    }
    let resolved = 0;
    for (const [fingerprint, finding] of open) {
      if (seen.has(fingerprint)) continue;
      finding.resolve(startedAt);
      changed.push(finding);
      resolved++;
    }
    await this.findings.saveAll(changed);
    const run = DiagnosisRun.completed({
      id: generateUuidV7(),
      startedAt,
      finishedAt: this.clock.now(),
      launchedBy,
      openCount: seen.size,
      newCount: created,
      resolvedCount: resolved,
    });
    await this.runs.saveRun(run);
    return run;
  }
}

export interface FindingView {
  id: string;
  rule: RuleCode;
  ruleTitle: string;
  severity: Severity;
  entity: EntityRef;
  explanation: string;
  proposal: string;
  hasFix: boolean;
  status: FindingStatus;
  detectedAt: string;
  lastSeenAt: string;
  closedAt: string | null;
  closedBy: string | null;
}

export interface RunView {
  startedAt: string;
  finishedAt: string;
  launchedBy: string;
  openCount: number;
  newCount: number;
  resolvedCount: number;
}

export interface DiagnosisView {
  run: RunView | null;
  items: FindingView[];
}

const RULE_ORDER = new Map(RULE_CATALOGUE.map((r, index) => [r.code, index]));

/** Los hallazgos de un estado, por gravedad, regla y nombre, con el último diagnóstico. */
export class ListFindings {
  constructor(
    private readonly findings: FindingRepository,
    private readonly runs: RunLog,
  ) {}

  async execute(status: FindingStatus): Promise<DiagnosisView> {
    const run = await this.runs.lastRun();
    const items = (await this.findings.list(status)).sort((a, b) =>
      (RULE_ORDER.get(a.rule) ?? 0) - (RULE_ORDER.get(b.rule) ?? 0) ||
      a.entity.label.localeCompare(b.entity.label, 'es')
    );
    return {
      run: run === null ? null : {
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt.toISOString(),
        launchedBy: run.launchedBy,
        openCount: run.openCount,
        newCount: run.newCount,
        resolvedCount: run.resolvedCount,
      },
      items: items.map(viewOf),
    };
  }
}

function viewOf(finding: Finding): FindingView {
  return {
    id: finding.id,
    rule: finding.rule,
    ruleTitle: ruleDefinition(finding.rule).title,
    severity: finding.severity(),
    entity: finding.entity,
    explanation: finding.explanation,
    proposal: finding.proposal,
    hasFix: finding.fix !== null,
    status: finding.status(),
    detectedAt: finding.detectedAt.toISOString(),
    lastSeenAt: finding.lastSeenAt().toISOString(),
    closedAt: finding.closedAt()?.toISOString() ?? null,
    closedBy: finding.closedBy(),
  };
}

async function lookUp(findings: FindingRepository, id: string): Promise<Finding> {
  const finding = await findings.byId(id);
  if (finding === null) throw new FindingNotFound();
  return finding;
}

/**
 * Acepta un hallazgo: vuelve a ejecutar su regla sobre los hechos de ahora y, si el caso sigue igual (misma huella),
 * aplica su arreglo y lo marca aceptado. Si los datos cambiaron, no aplica nada.
 */
export class AcceptFinding {
  constructor(
    private readonly findings: FindingRepository,
    private readonly source: FactsSource,
    private readonly executor: FixExecutor,
    private readonly clock: Clock,
  ) {}

  async execute(id: string, by: string): Promise<void> {
    const finding = await lookUp(this.findings, id);
    // Comprueba estado y arreglo antes de cargar los hechos.
    finding.assertAcceptable();
    if (!await this.stillReproduces(finding)) throw new FindingOutdated();
    await this.executor.apply(finding.fix as Fix);
    finding.accept(by, this.clock.now());
    await this.findings.save(finding);
  }

  private async stillReproduces(finding: Finding): Promise<boolean> {
    const facts: Facts = await this.source.load();
    return ruleFor(finding.rule)(facts).some((candidate: Candidate) =>
      Fingerprint.of(candidate.rule, candidate.entity, candidate.data).equals(finding.fingerprint)
    );
  }
}

/** Descarta un hallazgo: no vuelve a salir mientras los datos del caso sean los mismos. */
export class DismissFinding {
  constructor(
    private readonly findings: FindingRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string, by: string): Promise<void> {
    const finding = await lookUp(this.findings, id);
    finding.dismiss(by, this.clock.now());
    await this.findings.save(finding);
  }
}

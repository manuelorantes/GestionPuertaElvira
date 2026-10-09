import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue, LocalDate, YearMonth } from '../../src/domain/common/mod.ts';
import {
  PointMovement,
  PointsAlreadySpent,
  type PointsKind,
  Tournament,
} from '../../src/domain/points/mod.ts';
import {
  AdjustPointsByHand,
  DeleteTournament,
  MarkFriday,
  MarkTournamentPhoto,
  type PointMovementRepository,
  PointsStudentNotFound,
  PointsWalletService,
  SaveTournament,
  TournamentHasPhotos,
  type TournamentRepository,
} from '../../src/application/points/mod.ts';
import { FrozenClock } from '../support/identity.ts';

class InMemoryPoints implements PointMovementRepository, TournamentRepository {
  readonly movements = new Map<string, PointMovement>();
  readonly tournaments = new Map<string, Tournament>();

  forStudent(student: string) {
    return Promise.resolve([...this.movements.values()].filter((m) => m.student === student));
  }
  find(student: string, kind: PointsKind, reference: string): Promise<PointMovement | null>;
  find(id: string): Promise<Tournament | null>;
  find(
    a: string,
    kind?: PointsKind,
    reference?: string,
  ): Promise<PointMovement | Tournament | null> {
    if (kind === undefined) return Promise.resolve(this.tournaments.get(a) ?? null);
    return Promise.resolve(
      [...this.movements.values()].find((m) =>
        m.student === a && m.kind === kind && m.reference === reference
      ) ??
        null,
    );
  }
  add(m: PointMovement) {
    this.movements.set(m.id, m);
    return Promise.resolve();
  }
  remove(id: string) {
    this.movements.delete(id);
    return Promise.resolve();
  }
  save(t: Tournament) {
    this.tournaments.set(t.id, t);
    return Promise.resolve();
  }
  delete(id: string) {
    this.tournaments.delete(id);
    return Promise.resolve();
  }
  photos(id: string) {
    return Promise.resolve([...this.movements.values()].filter((m) => m.reference === id).length);
  }
}

const ACTIVE = { isActive: (s: string) => Promise.resolve(s !== 'baja') };
const clock = new FrozenClock('2026-10-09T18:00:00+02:00');

Deno.test('Fridays should give a point each, only on past Fridays, and come off unless already spent', async () => {
  const db = new InMemoryPoints();
  const mark = new MarkFriday(db, ACTIVE, clock);
  const wallet = new PointsWalletService(db);
  await mark.execute('s1', '2026-10-02', true, 'u1');
  await mark.execute('s1', '2026-10-02', true, 'u1');
  await mark.execute('s1', '2026-10-09', true, 'u1');
  assertEquals(
    await wallet.available('s1', YearMonth.fromString('2026-10')),
    2,
    'marcar dos veces no suma dos',
  );
  await assertRejects(
    () => mark.execute('s1', '2026-10-16', true, 'u1'),
    InvalidValue,
    'aún no ha llegado',
  );
  await assertRejects(() => mark.execute('baja', '2026-10-02', true, 'u1'), PointsStudentNotFound);

  await new AdjustPointsByHand(db, ACTIVE, clock).execute('s1', -2, 'Canje de material', 'u1');
  await assertRejects(() => mark.execute('s1', '2026-10-02', false, 'u1'), PointsAlreadySpent);
  await new AdjustPointsByHand(db, ACTIVE, clock).execute('s1', 2, 'Error', 'u1');
  await mark.execute('s1', '2026-10-02', false, 'u1');
  assertEquals(await wallet.available('s1', YearMonth.fromString('2026-10')), 1);
});

Deno.test('tournament photos should give their points in the month of the tournament', async () => {
  const db = new InMemoryPoints();
  const id = await new SaveTournament(db).execute(null, {
    name: 'Open de Granada',
    date: '2026-10-17',
    pointsPerPhoto: 2,
  });
  const photo = new MarkTournamentPhoto(db, db, ACTIVE);
  await photo.execute(id, 's1', true, 'u1');
  const wallet = new PointsWalletService(db);
  assertEquals(await wallet.available('s1', YearMonth.fromString('2026-10')), 2);
  await assertRejects(() => new DeleteTournament(db).execute(id), TournamentHasPhotos);
  await photo.execute(id, 's1', false, 'u1');
  await new DeleteTournament(db).execute(id);
  assertEquals(db.tournaments.size, 0);
});

Deno.test('a payment should redeem points of its month only', async () => {
  const db = new InMemoryPoints();
  for (const date of ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02']) {
    await db.add(PointMovement.friday('s1', LocalDate.fromString(date), 'u1'));
  }
  const wallet = new PointsWalletService(db);
  assertEquals(
    await wallet.available('s1', YearMonth.fromString('2026-10')),
    1,
    'septiembre ya caducó',
  );
  await assertRejects(
    () => wallet.redeem('s1', LocalDate.fromString('2026-10-09'), 5, 'p1', 'Canje'),
    PointsAlreadySpent,
  );
  await wallet.redeem('s1', LocalDate.fromString('2026-09-28'), 4, 'p0', 'Canje');
  assertEquals(await wallet.available('s1', YearMonth.fromString('2026-09')), 0);
});

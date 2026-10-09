import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue, LocalDate, YearMonth } from '../../src/domain/common/mod.ts';
import {
  PointMovement,
  PointsAlreadySpent,
  type PointsKind,
  type TournamentPhoto,
} from '../../src/domain/points/mod.ts';
import {
  AddTournamentPhoto,
  AdjustPointsByHand,
  DeleteTournamentPhoto,
  MarkFriday,
  type PhotoStorage,
  type PointMovementRepository,
  PointsStudentNotFound,
  PointsWalletService,
  type TournamentPhotoRepository,
} from '../../src/application/points/mod.ts';
import { FrozenClock } from '../support/identity.ts';

class InMemoryPoints implements PointMovementRepository, PhotoStorage {
  readonly movements = new Map<string, PointMovement>();
  readonly photos = new Map<string, TournamentPhoto>();
  readonly files = new Map<string, Uint8Array>();
  readonly photoRepository: TournamentPhotoRepository = {
    find: (id) => Promise.resolve(this.photos.get(id) ?? null),
    save: (p) => Promise.resolve(void this.photos.set(p.id, p)),
    delete: (id) => Promise.resolve(void this.photos.delete(id)),
  };

  forStudent(student: string) {
    return Promise.resolve([...this.movements.values()].filter((m) => m.student === student));
  }
  find(student: string, kind: PointsKind, reference: string) {
    return Promise.resolve(
      [...this.movements.values()].find((m) =>
        m.student === student && m.kind === kind && m.reference === reference
      ) ?? null,
    );
  }
  add(m: PointMovement) {
    this.movements.set(m.id, m);
    return Promise.resolve();
  }
  /** Quita un movimiento (por id) o un fichero (por clave). */
  remove(idOrKey: string) {
    this.movements.delete(idOrKey);
    this.files.delete(idOrKey);
    return Promise.resolve();
  }
  put(key: string, contents: Uint8Array) {
    this.files.set(key, contents);
    return Promise.resolve();
  }
  read(key: string) {
    return Promise.resolve(this.files.get(key) ?? new Uint8Array());
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

Deno.test('a tournament photo should store the image and give a point in the month of the photo', async () => {
  const db = new InMemoryPoints();
  const image = { contents: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), mimeType: 'image/jpeg' };
  const id = await new AddTournamentPhoto(db.photoRepository, db, ACTIVE, db, clock).execute(
    's1',
    '2026-10-04',
    'Open de Granada',
    image,
    'u1',
  );
  const photo = db.photos.get(id);
  assertEquals(db.files.get(photo?.documentKey ?? ''), image.contents);
  const wallet = new PointsWalletService(db);
  assertEquals(await wallet.available('s1', YearMonth.fromString('2026-10')), 1);
  await assertRejects(
    () =>
      new AddTournamentPhoto(db.photoRepository, db, ACTIVE, db, clock).execute(
        'baja',
        '2026-10-04',
        null,
        image,
        'u1',
      ),
    PointsStudentNotFound,
  );

  await new DeleteTournamentPhoto(db.photoRepository, db, db).execute(id);
  assertEquals([db.photos.size, await wallet.available('s1', YearMonth.fromString('2026-10'))], [
    0,
    0,
  ]);
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

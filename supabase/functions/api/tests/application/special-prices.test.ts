import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue, Money } from '../../src/domain/common/mod.ts';
import { StudentRef } from '../../src/domain/billing/mod.ts';
import {
  BillingStudentNotFound,
  FixStudentPrice,
  GetStudentAccount,
  QuotePayment,
  SetSpecialClassPrice,
  SpecialClassNotFound,
  type SpecialClassPrices,
} from '../../src/application/billing/mod.ts';
import { BillingFixture } from '../support/billing.ts';

class InMemorySpecialClassPrices implements SpecialClassPrices {
  levels = new Map<string, string>([['rey', 'beginner'], ['particular', 'private_lesson']]);
  prices = new Map<string, Money>();

  levelOf(groupId: string): Promise<string | null> {
    return Promise.resolve(this.levels.get(groupId) ?? null);
  }

  setPrice(groupId: string, price: Money | null): Promise<void> {
    if (price === null) this.prices.delete(groupId);
    else this.prices.set(groupId, price);
    return Promise.resolve();
  }
}

Deno.test('SetSpecialClassPrice should set and remove the monthly price of a group, but not of private lessons', async () => {
  const prices = new InMemorySpecialClassPrices();
  const set = new SetSpecialClassPrice(prices);

  await set.execute('rey', '50,00');
  assertEquals(prices.prices.get('rey')?.cents, 5000);
  await set.execute('rey', null);
  assertEquals(prices.prices.has('rey'), false);

  const privateLesson = await assertRejects(
    () => set.execute('particular', '50'),
    InvalidValue,
  );
  assertEquals(privateLesson.field, 'monthlyPrice');
  const negative = await assertRejects(() => set.execute('rey', '-1'), InvalidValue);
  assertEquals(negative.field, 'monthlyPrice');
  await assertRejects(() => set.execute('nada', '50'), SpecialClassNotFound);
});

Deno.test('FixStudentPrice should fix and remove the monthly price of a student, which then is their fee', async () => {
  const fx = new BillingFixture();
  const id = fx.student({
    regularHours: 3,
    specialClasses: [{ groupName: 'Rey A', monthlyPrice: Money.euros(50) }],
  });
  const fee = async () => (await new GetStudentAccount(
    fx,
    fx,
    new QuotePayment(fx, fx, fx, fx, fx.clock, fx),
    fx.clock,
    fx,
    fx,
  )
    .execute(id));
  assertEquals((await fee()).monthlyFeeCents, 5500 + 5000);

  await new FixStudentPrice(fx, fx, fx.clock).execute(id, '60');
  assertEquals((await fee()).monthlyFeeCents, 6000);
  assertEquals((await fee()).fixedPrice, '60.00');

  await new FixStudentPrice(fx, fx, fx.clock).execute(id, '');
  assertEquals((await fee()).fixedPrice, null);
  assertEquals((await fee()).monthlyFeeCents, 10500);

  await assertRejects(
    () => new FixStudentPrice(fx, fx, fx.clock).execute(StudentRef.generate().value, '60'),
    BillingStudentNotFound,
  );
});

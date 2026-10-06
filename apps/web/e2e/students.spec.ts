import { expect, test, type Locator, type Page } from '@playwright/test';

// Datos de `make e2e`: demostración del diseño reiniciada (16 alumnos ficticios).
test.skip(({ isMobile }) => isMobile, 'Modifica datos compartidos: solo en escritorio');

async function openStudents(page: Page) {
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('admin@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: /alumnos/i }).click();
}

/** Elige la opción cuyo texto empieza por `prefix` (las opciones de grupo incluyen horario y ocupación). */
async function selectStartingWith(select: Locator, prefix: string) {
  const value = await select.locator('option', { hasText: prefix }).first().getAttribute('value');
  if (value === null) throw new Error(`No hay opción «${prefix}»`);
  await select.selectOption(value);
}

async function openCard(page: Page, name: RegExp) {
  await page.getByRole('searchbox', { name: 'Buscar alumnos' }).fill('');
  await page.getByRole('button', { name }).click();
  return page.getByRole('dialog', { name });
}

test('should find students ignoring accents and case', async ({ page }) => {
  await openStudents(page);

  await page.getByRole('searchbox', { name: 'Buscar alumnos' }).fill('LOPEZ');

  await expect(page.getByText(/^2 de \d+ mostrados$/)).toBeVisible();
  await expect(page.getByRole('button', { name: /martina lópez herrera/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /pablo lópez herrera/i })).toBeVisible();
});

test('should register a minor in two groups, with the guardian added before saving', async ({
  page,
}) => {
  await openStudents(page);
  await page.getByRole('button', { name: 'Nuevo alumno' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo alumno' });
  await dialog.getByLabel('Nombre y apellidos').fill('Lucía Fernández Ortiz');
  await dialog.getByLabel('Día').selectOption('7');
  await dialog.getByLabel('Mes').selectOption({ label: 'marzo' });
  await dialog.getByLabel('Año').selectOption('2015');
  await expect(dialog.getByText(/pendiente: tutor y email/i)).toBeVisible();
  await dialog.getByLabel('Tutor 1', { exact: true }).fill('Carmen Ortiz');
  await dialog.getByLabel('Teléfono tutor 1').fill('612000111');

  // Lunes 17:00–18:00: hay clase en Alfil (Iniciación A) y en Caballo (Intermedio C): se elige el aula.
  await dialog.getByRole('button', { name: 'Añadir horario' }).click();
  const first = dialog.getByRole('group', { name: 'Horario 1' });
  await first.getByLabel('Día').selectOption('mon');
  await first.getByLabel('Empieza').selectOption('17:00');
  await first.getByLabel('Termina').selectOption('18:00');
  await first.getByLabel(/Aula para/).selectOption('alfil');
  await expect(dialog.getByText('Iniciación A', { exact: true })).toBeVisible();
  // Viernes 16:30–17:30: solo Peques A.
  await dialog.getByRole('button', { name: 'Añadir horario' }).click();
  const second = dialog.getByRole('group', { name: 'Horario 2' });
  await second.getByLabel('Día').selectOption('fri');
  await second.getByLabel('Empieza').selectOption('16:30');
  await second.getByLabel('Termina').selectOption('17:30');
  await expect(dialog.getByText('Peques A', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Dar de alta' }).click();

  const card = page.getByRole('dialog', { name: 'Lucía Fernández Ortiz' });
  await expect(card.getByText('Iniciación A', { exact: true })).toBeVisible();
  await expect(card.getByText('Peques A', { exact: true })).toBeVisible();
});

test('should confirm before enrolling in a full group', async ({ page }) => {
  await openStudents(page);

  let card = await openCard(page, /javier navarro pérez/i);
  await card.getByRole('button', { name: 'Añadir grupo' }).click();
  await selectStartingWith(
    page.getByRole('dialog', { name: 'Añadir grupo' }).getByLabel('Grupo'),
    'Particular · viernes',
  );
  await page
    .getByRole('dialog', { name: 'Añadir grupo' })
    .getByRole('button', { name: 'Añadir' })
    .click();
  await expect(card.getByText('Particular · viernes', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  card = await openCard(page, /clara ibáñez soto/i);
  await card.getByRole('button', { name: 'Añadir grupo' }).click();
  await selectStartingWith(
    page.getByRole('dialog', { name: 'Añadir grupo' }).getByLabel('Grupo'),
    'Particular · viernes',
  );
  await page
    .getByRole('dialog', { name: 'Añadir grupo' })
    .getByRole('button', { name: 'Añadir' })
    .click();

  const confirm = page.getByRole('dialog', { name: 'Grupo completo' });
  await expect(confirm).toContainText('El grupo está completo (2/2). ¿Inscribir igualmente?');
  await confirm.getByRole('button', { name: 'Inscribir igualmente' }).click();
  await expect(card.getByText('Particular · viernes', { exact: true })).toBeVisible();
});

test('should withdraw a student and show them as withdrawn', async ({ page }) => {
  await openStudents(page);

  const card = await openCard(page, /hugo martín castillo/i);
  await card.getByRole('button', { name: 'Dar de baja' }).click();
  await page
    .getByRole('dialog', { name: /dar de baja a hugo/i })
    .getByRole('button', { name: 'Dar de baja' })
    .click();
  await expect(card.getByText('De baja', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'De baja', exact: true }).click();
  await expect(page.getByRole('button', { name: /hugo martín castillo/i })).toBeVisible();
  await expect(page.getByText(/^1 de \d+ mostrados$/)).toBeVisible();
});

test('should enrol with a special schedule and show it on the card and the group', async ({
  page,
}) => {
  await openStudents(page);

  const card = await openCard(page, /pablo lópez herrera/i);
  await card.getByRole('button', { name: 'Añadir grupo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir grupo' });
  await selectStartingWith(dialog.getByLabel('Grupo'), 'Iniciación D');
  await dialog.getByRole('switch', { name: 'Horario especial' }).click();
  await dialog.getByRole('button', { name: 'Mié' }).click(); // solo los lunes
  await dialog.getByRole('button', { name: 'Añadir' }).click();

  await expect(card.getByText('Horario especial: Lun · 18:30–19:30')).toBeVisible();
});

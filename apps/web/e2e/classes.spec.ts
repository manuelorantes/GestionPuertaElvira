import { expect, test, type Page } from '@playwright/test';

// Datos de `make e2e`: usuarios de desarrollo y demostración del diseño reiniciados.
test.skip(({ isMobile }) => isMobile, 'Modifica datos compartidos: solo en escritorio');

async function openClasses(page: Page) {
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('admin@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: /clases/i }).click();
}

test('should create a teacher and a group and show it in the weekly schedule', async ({ page }) => {
  await openClasses(page);

  await page.getByRole('tab', { name: 'Profesores' }).click();
  await page.getByLabel('Nombre y apellidos').fill('Elena Prueba Ruiz');
  await page.getByRole('button', { name: 'Añadir profesor' }).click();
  await expect(page.getByText('Elena Prueba Ruiz')).toBeVisible();

  await page.getByRole('button', { name: 'Nuevo grupo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo grupo' });
  await dialog.getByLabel('Nombre del grupo').fill('Adultos III');
  await dialog.getByLabel('Nivel').selectOption({ label: 'Intermedio' });
  await dialog.getByLabel('Profesor').selectOption({ label: 'Elena Prueba Ruiz' });
  await dialog.getByRole('button', { name: 'Lun' }).click();
  await dialog.getByLabel('Empieza').selectOption('19:30');
  await dialog.getByLabel('Termina').selectOption('21:00');
  await dialog.getByRole('button', { name: 'Aula Caballo' }).click();
  await expect(dialog.getByText('1,5 h semanales', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Crear grupo' }).click();

  await expect(page.getByRole('status')).toHaveText('Grupo «Adultos III» creado');
  await page.getByRole('tab', { name: 'Horario semanal' }).click();
  await expect(
    page.getByRole('button', { name: /Adultos III, Lun · 19:30–21:00, Elena Prueba Ruiz/ }),
  ).toBeVisible();
});

test('should refuse a group that clashes with another in the same classroom', async ({ page }) => {
  await openClasses(page);

  await page.getByRole('button', { name: 'Nuevo grupo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo grupo' });
  await dialog.getByLabel('Nombre del grupo').fill('Choque');
  await dialog.getByRole('button', { name: 'Vie' }).click();
  await dialog.getByLabel('Empieza').selectOption('18:00');
  await dialog.getByLabel('Termina').selectOption('19:00');
  await dialog.getByRole('button', { name: 'Crear grupo' }).click();

  await expect(dialog.getByRole('alert')).toContainText(
    'Coincide en el aula Alfil con «Competición»',
  );
});

test('should name a group by its day, time, level and classroom when no name is given', async ({
  page,
}) => {
  await openClasses(page);

  await page.getByRole('button', { name: 'Nuevo grupo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo grupo' });
  await dialog.getByRole('button', { name: 'Mié' }).click();
  await dialog.getByLabel('Empieza').selectOption('16:00');
  await dialog.getByLabel('Termina').selectOption('17:00');
  await dialog.getByRole('button', { name: 'Aula Peón' }).click();
  await dialog.getByRole('button', { name: 'Crear grupo' }).click();

  await expect(page.getByRole('status')).toHaveText(
    'Grupo «Miércoles 16:00 · Iniciación · Peón» creado',
  );
  await page.getByRole('tab', { name: 'Grupos' }).click();
  await expect(
    page.getByRole('cell', { name: 'Miércoles 16:00 · Iniciación · Peón', exact: true }),
  ).toBeVisible();
});

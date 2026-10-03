import { expect, test, type Page } from '@playwright/test';

// Datos de `make e2e`: tarifas del diseño, sesiones propuestas desde septiembre y liquidaciones anteriores pagadas salvo una.
const month = new Date().getMonth() + 1;
test.skip(({ isMobile }) => isMobile, 'Modifica datos compartidos: solo en escritorio');
test.skip(month === 7 || month === 8, 'En julio y agosto no hay clases');

async function openTeachers(page: Page, query = '') {
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('admin@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: /^profesores/i }).click();
  if (query) await page.goto(`/panel/profesores${query}`);
}

test('should show the profitability of each teacher', async ({ page }) => {
  await openTeachers(page);

  await expect(page.getByRole('table', { name: /Rentabilidad de/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Javier Ortega Sánchez/ })).toContainText('20 €/h');
});

test('should record extra hours for an activity', async ({ page }) => {
  await openTeachers(page, '?pestana=horas');
  await page.getByRole('button', { name: 'Registrar horas' }).click();

  const dialog = page.getByRole('dialog', { name: 'Registrar horas' });
  await dialog.getByLabel('Profesor').selectOption({ label: 'Ana Belén Torres' });
  await dialog.getByLabel('Clase').selectOption('other');
  await dialog.getByLabel('Actividad').fill('Torneo escolar de prueba');
  await dialog.getByRole('button', { name: 'Más horas' }).click();
  await expect(dialog.getByText('Coste a 15 €/h: 22,50 €')).toBeVisible();
  await dialog.getByRole('button', { name: 'Guardar horas' }).click();

  await expect(page.getByRole('cell', { name: 'Torneo escolar de prueba' })).toBeVisible();
});

test('should pay the pending settlement of last month', async ({ page }) => {
  test.skip(month === 9, 'En septiembre no hay mes anterior de temporada');
  await openTeachers(page, '?pestana=liquidacion');

  const row = page.getByRole('row', { name: /Miguel Á. Fernández/ });
  await expect(row.getByText('Pendiente')).toBeVisible();
  await row.getByRole('button', { name: 'Marcar como pagada' }).click();
  await expect(row.getByText(/Pagada el/)).toBeVisible();
});

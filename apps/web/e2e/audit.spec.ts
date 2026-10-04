import { expect, test } from '@playwright/test';

test.skip(({ isMobile }) => isMobile, 'Modifica datos compartidos: solo en escritorio');

test('should record an action with its author and undo it', async ({ page }) => {
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('admin@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-admin');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByRole('link', { name: /contabilidad/i }).click();
  await page.getByRole('button', { name: 'Añadir movimiento' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir movimiento' });
  await dialog.getByRole('button', { name: 'Gasto' }).click();
  await dialog.getByLabel('Concepto').fill('Gasto para probar el historial');
  await dialog.getByLabel('Categoría').selectOption('other_expenses');
  await dialog.getByLabel('Importe (€)').fill('3');
  await dialog.getByRole('button', { name: 'Guardar movimiento' }).click();
  await expect(
    page.getByRole('cell', { name: 'Gasto para probar el historial', exact: true }),
  ).toBeVisible();

  await page.getByRole('link', { name: /historial/i }).click();
  const row = page.getByRole('row', { name: /Añadir movimiento/ }).first();
  await expect(row).toContainText('Administración Pruebas');
  await row.getByRole('button', { name: 'Ver detalle de Añadir movimiento' }).click();
  await expect(page.getByText('Gasto para probar el historial')).toBeVisible();
  await row.getByRole('button', { name: 'Deshacer Añadir movimiento' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Deshacer' }).click();
  await expect(
    page.getByRole('row', { name: /Deshacer: Añadir movimiento/ }).first(),
  ).toBeVisible();

  await page.getByRole('link', { name: /contabilidad/i }).click();
  await expect(page.getByRole('table', { name: /Movimientos de/ })).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Gasto para probar el historial', exact: true }),
  ).toHaveCount(0);
});

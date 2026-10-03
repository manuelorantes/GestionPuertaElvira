import { expect, test, type Page } from '@playwright/test';

// Datos de `make e2e`: facturas del diseño en el mes actual y el anterior, cobros y liquidaciones de demostración.
test.skip(({ isMobile }) => isMobile, 'Modifica datos compartidos: solo en escritorio');

async function openAccounting(page: Page, query = '') {
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('admin@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: /contabilidad/i }).click();
  if (query) await page.goto(`/panel/contabilidad${query}`);
}

test('should list the movements of the month with the rent paid', async ({ page }) => {
  await openAccounting(page);

  const table = page.getByRole('table', { name: /Movimientos de/ });
  await expect(table.getByRole('row', { name: /Propietario del local/ })).toContainText('−950 €');
  await expect(page.getByRole('region', { name: /Gastos de/ }).getByText('Alquiler')).toBeVisible();
});

test('should register a supplier invoice with its PDF and open the document', async ({ page }) => {
  await openAccounting(page, '?pestana=facturas');
  await page.getByRole('button', { name: 'Añadir factura' }).click();

  const dialog = page.getByRole('dialog', { name: 'Añadir factura' });
  await dialog.getByLabel('Documento').setInputFiles({
    name: 'tableros.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n'),
  });
  await dialog.getByLabel('Proveedor').fill('Escaque Material Didáctico');
  await dialog.getByLabel('Nº de factura').fill('E-PRUEBA-1');
  await dialog.getByLabel('Concepto').fill('Tableros de prueba');
  await dialog.getByLabel('Importe (€)').fill('64,90');
  await dialog.getByLabel('Categoría').selectOption('material');
  await dialog.getByRole('button', { name: 'Guardar factura' }).click();

  const link = page.getByRole('link', { name: 'Ver documento de E-PRUEBA-1' });
  await expect(link).toBeVisible();
  const response = await page.request.get((await link.getAttribute('href')) ?? '');
  expect(response.headers()['content-type']).toBe('application/pdf');
});

test('should show the season month by month', async ({ page }) => {
  await openAccounting(page, '?pestana=cierre');

  await expect(page.getByRole('table', { name: /mes a mes/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /Cierre de temporada/ })).toContainText('Abierta');
});

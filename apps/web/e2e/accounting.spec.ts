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

test('should split an invoice between the months it applies to', async ({ page }) => {
  // Con una factura: un apunte manual se cruzaría con el test del historial, que mira el último.
  await openAccounting(page, '?pestana=facturas');
  await page.getByRole('button', { name: 'Añadir factura' }).click();

  const dialog = page.getByRole('dialog', { name: 'Añadir factura' });
  await dialog.getByLabel('Proveedor').fill('Agencia Tributaria');
  await dialog.getByLabel('Concepto').fill('IVA de prueba repartido');
  await dialog.getByLabel('Importe (€)').fill('90');
  await dialog.getByLabel('Categoría').selectOption('other_expenses');
  await dialog.getByLabel('Mes al que corresponde').selectOption('many');
  // Ya lleva el mes de la factura; se añade otro.
  const months = dialog.getByRole('group', { name: 'Meses a los que corresponde' });
  await months.getByRole('button', { pressed: false }).last().click();
  await expect(dialog.getByText('Repartido a partes iguales.')).toBeVisible();
  await expect(dialog.getByLabel(/^[A-Z][a-z]+ \d{4} \(€\)$/)).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Guardar factura' }).click();
  await expect(page.getByText('Factura registrada')).toBeVisible();

  await page.getByRole('tab', { name: 'Movimientos' }).click();
  const row = page.getByRole('table', { name: /Movimientos de/ }).getByRole('row', {
    name: /IVA de prueba repartido/,
  });
  await expect(row).toContainText('−90 €');
  await expect(row).toContainText('Corresponde a');
});

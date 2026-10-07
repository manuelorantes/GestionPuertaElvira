import { expect, test, type Page } from '@playwright/test';

// Datos de `make e2e`: demostración reiniciada con cobros desde septiembre (ver SeedDemoDataCommand).
const month = new Date().getMonth() + 1;
test.skip(({ isMobile }) => isMobile, 'Modifica datos compartidos: solo en escritorio');
test.skip(month === 7 || month === 8, 'En julio y agosto no hay cuotas');

async function openBilling(page: Page) {
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('admin@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: /cobros y cuotas/i }).click();
}

test('should register a monthly payment, print its receipt and issue an invoice', async ({
  page,
}) => {
  await openBilling(page);
  const row = page.getByRole('row', { name: /Sofía Ramírez Vílchez/ });
  await row.getByRole('button', { name: /Registrar cobro|Cobrar/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Registrar cobro' });
  await dialog.getByRole('button', { name: 'Mes', exact: true }).click();
  await expect(dialog.getByText('Total a cobrar')).toBeVisible();
  await dialog.getByRole('button', { name: 'Transferencia' }).click();
  await dialog.getByRole('button', { name: 'Guardar cobro' }).click();

  const receipt = page.getByRole('dialog', { name: 'Recibo' });
  await expect(receipt.getByText(/Recibo R-\d{4}-\d{4}/)).toBeVisible();
  await expect(receipt.getByText('Forma de pago: Transferencia')).toBeVisible();
  await receipt.getByRole('button', { name: 'Emitir factura' }).click();

  const invoice = page.getByRole('dialog', { name: 'Emitir factura' });
  await invoice.getByLabel('NIF').fill('00000000T');
  await invoice.getByLabel('Dirección').fill('Calle Ficticia 1, Granada');
  await invoice.getByRole('button', { name: 'Emitir factura' }).click();

  await expect(receipt.getByText('Base imponible')).toBeVisible();
  await receipt.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(row.getByText('Cobrada')).toBeVisible();
});

test('should show last month overdue charges with a WhatsApp reminder', async ({ page }) => {
  test.skip(month === 9, 'En septiembre no hay mes anterior de temporada');
  await openBilling(page);

  await page.getByRole('button', { name: 'Mes anterior' }).click();

  const row = page.getByRole('row', { name: /Irene Moreno Salas/ });
  await expect(row.getByText('Vencida')).toBeVisible();
  await row.getByRole('button', { name: 'WhatsApp' }).click();
  const dialog = page.getByRole('dialog', { name: 'Aviso por WhatsApp' });
  await expect(dialog.getByLabel('Mensaje')).toHaveValue(/Hola Inmaculada/);
});

test('should keep the published tariffs in the settings', async ({ page }) => {
  await openBilling(page);

  await page.getByRole('tab', { name: 'Tarifas y ajustes' }).click();

  await expect(page.getByLabel('3 h o más a la semana')).toHaveValue('55.00');
  await expect(page.getByLabel('Familiar (familia directa en el club)')).toHaveValue('10');
});

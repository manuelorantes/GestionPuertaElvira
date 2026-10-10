import { expect, test, type Page } from '@playwright/test';

// Datos de `make e2e`: demostración reiniciada (sin material). Crea su propio producto con nombre único.
test.skip(({ isMobile }) => isMobile, 'Modifica datos compartidos: solo en escritorio');

async function openMaterial(page: Page, view: string) {
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('admin@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: /cobros y cuotas/i }).click();
  await page.goto(`/panel/cobros?pestana=material&vista=${view}`);
}

test('should sell a product to a student: product, purchase, order, payment and delivery', async ({
  page,
}) => {
  const name = `Sudadera ${Date.now()}`;
  await openMaterial(page, 'productos');

  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  const product = page.getByRole('dialog', { name: 'Nuevo producto' });
  await product.getByLabel('Nombre', { exact: true }).fill(name);
  await product.getByLabel('Precio de venta (€)').fill('30');
  await product.getByRole('button', { name: 'Añadir campo' }).click();
  await product.getByLabel('Nombre del campo').fill('Talla');
  await product.getByLabel('Opciones (separadas por comas)').fill('S, M');
  await product.getByRole('button', { name: 'Crear producto' }).click();
  await expect(page.getByRole('list', { name: 'Productos' })).toContainText(name);

  await page.getByRole('button', { name: 'Stock y compras' }).click();
  await page.getByRole('button', { name: 'Registrar compra' }).click();
  const purchase = page.getByRole('dialog', { name: 'Registrar compra' });
  await purchase.getByLabel('Producto').selectOption({ label: name });
  await purchase.getByLabel('Coste del lote entero (€)').fill('40');
  await purchase.getByLabel('Talla S').fill('2');
  await purchase.getByRole('button', { name: 'Registrar compra' }).click();
  const stock = page.getByRole('table', { name: `Stock de ${name}` });
  await expect(stock.getByRole('row', { name: /Talla S/ })).toContainText('2');

  await page.getByRole('button', { name: 'Pedidos' }).click();
  await page.getByRole('button', { name: 'Apuntar pedido' }).click();
  const order = page.getByRole('dialog', { name: 'Apuntar pedido' });
  await order.getByRole('combobox', { name: 'Alumno' }).fill('Mateo Cano');
  await order.getByRole('option', { name: 'Mateo Cano Robles' }).click();
  await order.getByLabel('Producto').selectOption({ label: `${name} · 30 €` });
  await order.getByLabel('Talla').selectOption('S');
  await order.getByRole('switch', { name: /Ya con precio/ }).click();
  await order.getByRole('button', { name: 'Apuntar pedido' }).click();

  const row = page
    .getByRole('listitem')
    .filter({ hasText: 'Mateo Cano Robles' })
    .filter({ hasText: name });
  await expect(row.getByText('Pedido', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Cobrar' }).click();
  const payment = page.getByRole('dialog', { name: 'Registrar cobro' });
  await expect(payment.getByText('Total a cobrar')).toBeVisible();
  await payment.getByRole('button', { name: 'Guardar cobro' }).click();
  await page
    .getByRole('dialog', { name: 'Recibo' })
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click();

  await row.getByRole('button', { name: 'Entregar' }).click();
  await page
    .getByRole('dialog', { name: 'Entregar' })
    .getByRole('button', { name: 'Marcar como entregado' })
    .click();
  // Pagado y entregado: deja de estar abierto.
  await expect(row).toHaveCount(0);

  await page.getByRole('button', { name: 'Margen' }).click();
  await expect(
    page
      .getByRole('table', { name: 'Margen por producto' })
      .getByRole('row', { name: new RegExp(name) }),
  ).toContainText('10 €');
});

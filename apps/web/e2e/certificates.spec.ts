import { expect, test } from '@playwright/test';

// Datos de `make e2e`: demostración reiniciada. Daniel no lo toca ningún otro escenario.
test.skip(({ isMobile }) => isMobile, 'Modifica datos compartidos: solo en escritorio');

// PNG de 1×1 transparente: hace de firma escaneada (la de verdad nunca va al repositorio).
const SIGNATURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('should upload the signature and issue a signed enrolment certificate ready to print', async ({
  page,
}) => {
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('admin@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: /cobros y cuotas/i }).click();
  await page.goto('/panel/cobros?pestana=tarifas');
  await page.getByLabel('Imagen de la firma').setInputFiles({
    name: 'firma.png',
    mimeType: 'image/png',
    buffer: SIGNATURE,
  });
  await expect(page.getByRole('img', { name: /^Firma de / })).toBeVisible();

  await page.getByRole('link', { name: /alumnos/i }).click();
  await page.getByRole('button', { name: /daniel jiménez molina/i }).click();
  const card = page.getByRole('dialog', { name: /daniel jiménez molina/i });
  await card.getByRole('button', { name: 'Emitir certificado' }).click();
  const form = page.getByRole('dialog', { name: 'Certificado de matrícula' });
  await form.getByLabel('DNI o NIE').fill('12345678Z');
  await expect(form.getByRole('switch', { name: 'Con la firma escaneada' })).toBeChecked();
  await form.getByRole('button', { name: 'Emitir certificado' }).click();

  const printable = page.getByRole('dialog', { name: /^Certificado de Daniel/ });
  const sheet = printable.getByRole('article', { name: 'Certificado' });
  await expect(sheet).toContainText(
    'Que Daniel Jiménez Molina, con DNI 12345678Z, tiene matrícula',
  );
  await expect(sheet.getByRole('img', { name: /^Firma de / })).toBeVisible();
  await printable.getByRole('button', { name: 'Cerrar' }).click();
  await expect(card.getByRole('list', { name: 'Certificados emitidos' })).toContainText(
    'con firma escaneada',
  );
});

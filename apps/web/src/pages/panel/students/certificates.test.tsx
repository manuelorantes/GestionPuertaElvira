import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, mockApi, renderApp } from '@/test/render';

const DETAIL = {
  id: 's1',
  memberNumber: 7,
  fullName: 'Santiago Fernández Hernández',
  birthDate: '2015-03-12',
  age: 11,
  nationalId: null,
  contactEmail: 'familia@ejemplo.com',
  guardians: [{ name: 'Rocío Hernández', phone: '612 48 19 30' }],
  ownPhone: null,
  federationLicence: null,
  imageConsent: true,
  missingData: [],
  joinedOn: '2025-09-15',
  withdrawnOn: null,
  status: 'active',
  membership: [{ joinedOn: '2025-09-15', withdrawnOn: null }],
  groups: [],
  siblings: [],
};

const DRAFT = {
  studentName: 'Santiago Fernández Hernández',
  nationalId: null,
  memberSince: '2025-09-15',
  season: '2026/2027',
  year: '2026',
  schedule: 'los viernes de 17:00 a 18:30 horas',
  place: 'Granada',
  issuedOn: '2026-11-11',
  signer: { name: 'Manuel Orantes Taboada', role: 'Presidente' },
  signatureAvailable: true,
};

const CLUB = { name: 'Club Ajedrez Puerta Elvira', taxId: 'G18000000', address: 'Granada' };

const ISSUED = {
  id: 'c1',
  studentName: 'Santiago Fernández Hernández',
  nationalId: '12345678Z',
  periodKind: 'season',
  period: '2026/2027',
  schedule: 'los viernes de 17:00 a 18:30 horas',
  memberSince: '2025-09-15',
  place: 'Granada',
  issuedOn: '2026-11-11',
  signer: { name: 'Manuel Orantes Taboada', role: 'Presidente' },
  signed: true,
  issuedByName: 'Lucía Moreno Gil',
  createdAt: '2026-11-11T09:00:00.000Z',
};

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
    'GET /api/admin/students/pending-data': [200, { items: [] }],
    'GET /api/admin/groups': [200, { items: [] }],
    'GET /api/admin/teachers': [200, { items: [] }],
    'GET /api/admin/students?filter=active': [200, { items: [], total: 0 }],
    'GET /api/admin/students/s1': [200, DETAIL],
    'GET /api/admin/students/s1/certificates/draft': [200, DRAFT],
    'GET /api/admin/students/s1/certificates': [200, { items: [] }],
    ...extra,
  });
}

function sentBody(spy: ReturnType<typeof api>, method: string, url: string) {
  const call = spy.mock.calls.find(([u, init]) => u === url && init?.method === method);
  return JSON.parse(String(call?.[1]?.body ?? 'null')) as unknown;
}

describe('Certificados de matrícula', () => {
  it('issues a certificate from the student card, saving the DNI, and shows it ready to print', async () => {
    const user = userEvent.setup();
    const spy = api({
      'POST /api/admin/students/s1/certificates': [201, { ...ISSUED, club: CLUB }],
    });
    renderApp('/panel/alumnos/s1');

    const card = await screen.findByRole('dialog', { name: 'Santiago Fernández Hernández' });
    // Junto a «Editar».
    await user.click(await within(card).findByRole('button', { name: 'Emitir certificado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Certificado de matrícula' });
    expect(within(dialog).getByLabelText('Curso')).toHaveValue('2026/2027');
    expect(within(dialog).getByLabelText('Horario de clase')).toHaveValue(
      'los viernes de 17:00 a 18:30 horas',
    );
    expect(within(dialog).getByLabelText('Lugar')).toHaveValue('Granada');
    expect(
      within(dialog).getByText(
        'No consta en su ficha: si lo escribes, se guardará en ella. Vacío, no sale en el certificado.',
      ),
    ).toBeVisible();
    // El curso de hoy sale fijo.
    expect(within(dialog).getByLabelText('Curso')).toHaveAttribute('readonly');
    // Con el firmante por defecto y su firma subida, sale firmado.
    const signature = within(dialog).getByRole('switch', { name: 'Con la firma escaneada' });
    expect(signature).toBeChecked();

    await user.type(within(dialog).getByLabelText(/DNI o NIE/), '12345678Z');
    await user.click(within(dialog).getByRole('button', { name: 'Emitir certificado' }));
    await waitFor(() =>
      expect(sentBody(spy, 'POST', '/api/admin/students/s1/certificates')).toEqual({
        nationalId: '12345678Z',
        periodKind: 'season',
        period: '2026/2027',
        memberSince: '2025-09-15',
        schedule: 'los viernes de 17:00 a 18:30 horas',
        place: 'Granada',
        issuedOn: '2026-11-11',
        signerName: 'Manuel Orantes Taboada',
        signerRole: 'Presidente',
        signed: true,
      }),
    );

    const printable = await screen.findByRole('dialog', {
      name: 'Certificado de Santiago Fernández Hernández',
    });
    const sheet = within(printable).getByRole('article', { name: 'Certificado' });
    expect(sheet).toHaveTextContent(
      'Que Santiago Fernández Hernández, con DNI 12345678Z, tiene matrícula en el Club Ajedrez Puerta Elvira para el curso 2026/2027, en horario de clase los viernes de 17:00 a 18:30 horas, y pertenece al club desde el 15 de septiembre de 2025.',
    );
    expect(sheet).toHaveTextContent('En Granada, a 11 de noviembre de 2026.');
    expect(sheet).toHaveTextContent('NIF G18000000');
    expect(
      within(sheet).getByRole('img', { name: 'Firma de Manuel Orantes Taboada' }),
    ).toBeVisible();
    expect(within(sheet).getByRole('img', { name: 'Club Ajedrez Puerta Elvira' })).toBeVisible();
    expect(within(printable).getByRole('button', { name: 'Imprimir' })).toBeEnabled();
  });

  it('certifies an earlier year after confirming, with the date given and without a DNI', async () => {
    const user = userEvent.setup();
    const spy = api({
      'POST /api/admin/students/s1/certificates': [
        201,
        {
          ...ISSUED,
          nationalId: null,
          periodKind: 'year',
          period: '2025',
          memberSince: '2024-09-16',
          club: CLUB,
        },
      ],
    });
    renderApp('/panel/alumnos/s1');

    const card = await screen.findByRole('dialog', { name: 'Santiago Fernández Hernández' });
    await user.click(await within(card).findByRole('button', { name: 'Emitir certificado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Certificado de matrícula' });
    await user.click(within(dialog).getByRole('button', { name: 'Año' }));
    const period = within(dialog).getByRole('textbox', { name: 'Año' });
    expect(period).toHaveValue('2026');

    // Cambiarlo pide confirmar: lo de antes de la aplicación no se puede comprobar.
    await user.click(within(dialog).getByRole('button', { name: 'Cambiar' }));
    expect(within(dialog).getByText(/no se pueden comprobar/)).toBeVisible();
    expect(period).toHaveAttribute('readonly');
    await user.click(within(dialog).getByRole('button', { name: 'Cambiar igualmente' }));
    expect(period).not.toHaveAttribute('readonly');
    await user.clear(period);
    await user.type(period, '2025');
    expect(within(dialog).getByRole('group', { name: 'En el club desde' })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Emitir certificado' }));

    await waitFor(() =>
      expect(sentBody(spy, 'POST', '/api/admin/students/s1/certificates')).toMatchObject({
        nationalId: '',
        periodKind: 'year',
        period: '2025',
      }),
    );
    const sheet = await screen.findByRole('article', { name: 'Certificado' });
    expect(sheet).toHaveTextContent(
      'Que Santiago Fernández Hernández tiene matrícula en el Club Ajedrez Puerta Elvira durante el año 2025, en horario de clase',
    );
    expect(sheet).not.toHaveTextContent('DNI');
    expect(sheet).toHaveTextContent('pertenece al club desde el 16 de septiembre de 2024.');
  });

  it('signs by hand when another person signs', async () => {
    const user = userEvent.setup();
    const spy = api({
      'GET /api/admin/students/s1': [200, { ...DETAIL, nationalId: '12345678Z' }],
      'GET /api/admin/students/s1/certificates/draft': [200, { ...DRAFT, nationalId: '12345678Z' }],
      'POST /api/admin/students/s1/certificates': [
        201,
        {
          ...ISSUED,
          signer: { name: 'Lucía Moreno Gil', role: 'Secretaria' },
          signed: false,
          club: CLUB,
        },
      ],
    });
    renderApp('/panel/alumnos/s1');

    const card = await screen.findByRole('dialog', { name: 'Santiago Fernández Hernández' });
    await user.click(await within(card).findByRole('button', { name: 'Emitir certificado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Certificado de matrícula' });
    await user.clear(within(dialog).getByLabelText('Firma'));
    await user.type(within(dialog).getByLabelText('Firma'), 'Lucía Moreno Gil');
    await user.clear(within(dialog).getByLabelText('Cargo'));
    await user.type(within(dialog).getByLabelText('Cargo'), 'Secretaria');
    const signature = within(dialog).getByRole('switch', { name: 'Con la firma escaneada' });
    expect(signature).not.toBeChecked();
    expect(signature).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Emitir certificado' }));

    await waitFor(() =>
      expect(sentBody(spy, 'POST', '/api/admin/students/s1/certificates')).toMatchObject({
        signerName: 'Lucía Moreno Gil',
        signed: false,
      }),
    );
    const sheet = await screen.findByRole('article', { name: 'Certificado' });
    expect(within(sheet).queryByRole('img', { name: /Firma de/ })).not.toBeInTheDocument();
    expect(sheet).toHaveTextContent('Fdo.: Lucía Moreno Gil');
  });

  it('lists the certificates issued to the student and reopens one to print it again', async () => {
    const user = userEvent.setup();
    api({
      'GET /api/admin/students/s1/certificates': [200, { items: [ISSUED] }],
      'GET /api/admin/students/s1/certificates/c1': [200, { ...ISSUED, club: CLUB }],
    });
    renderApp('/panel/alumnos/s1');

    const list = await screen.findByRole('list', { name: 'Certificados emitidos' });
    const item = within(list).getByRole('button', { name: /Curso 2026\/2027 · 11\/11\/2026/ });
    expect(item).toHaveTextContent('con firma escaneada · emitido por Lucía Moreno Gil');
    await user.click(item);
    expect(
      await screen.findByRole('dialog', { name: 'Certificado de Santiago Fernández Hernández' }),
    ).toBeVisible();
  });
});

describe('Ajustes de los certificados', () => {
  const BILLING_SETTINGS = {
    threeHours: '55.00',
    twoHours: '45.00',
    hourAndHalf: '40.00',
    oneHour: '35.00',
    membershipFee: '50.00',
    familyPercent: 10,
    threeMonthsPercent: 10,
    sixMonthsPercent: 15,
    seasonPercent: 20,
    defaultPrivateRate: '30.00',
    privateRates: {},
    clubName: 'Club Ajedrez Puerta Elvira',
    clubTaxId: 'G18000000',
    clubAddress: 'Granada',
    vatPercent: 21,
  };

  it('changes the default signer, warning that the scanned signature goes with the old one', async () => {
    const user = userEvent.setup();
    const spy = mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      'GET /api/admin/billing/settings': [200, BILLING_SETTINGS],
      'GET /api/admin/teachers': [200, { items: [] }],
      'GET /api/admin/students/certificate-settings': [
        200,
        {
          signerName: 'Manuel Orantes Taboada',
          signerRole: 'Presidente',
          signatureAvailable: true,
        },
      ],
      'PUT /api/admin/students/certificate-settings': [204],
    });
    renderApp('/panel/cobros?pestana=tarifas');

    const name = await screen.findByLabelText('Nombre de quien firma');
    expect(screen.getByRole('img', { name: 'Firma de Manuel Orantes Taboada' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cambiar firma' })).toBeEnabled();
    await user.clear(name);
    await user.type(name, 'Lucía Moreno Gil');
    expect(
      screen.getByText(
        'La firma escaneada es de Manuel Orantes Taboada: al guardar a otra persona se quita.',
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Guardar firmante' }));
    await waitFor(() =>
      expect(sentBody(spy, 'PUT', '/api/admin/students/certificate-settings')).toEqual({
        signerName: 'Lucía Moreno Gil',
        signerRole: 'Presidente',
      }),
    );
  });

  it('uploads the scanned signature', async () => {
    const user = userEvent.setup();
    const spy = mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      'GET /api/admin/billing/settings': [200, BILLING_SETTINGS],
      'GET /api/admin/teachers': [200, { items: [] }],
      'GET /api/admin/students/certificate-settings': [
        200,
        {
          signerName: 'Manuel Orantes Taboada',
          signerRole: 'Presidente',
          signatureAvailable: false,
        },
      ],
      'POST /api/admin/students/certificate-signature': [204],
    });
    renderApp('/panel/cobros?pestana=tarifas');

    expect(
      await screen.findByText(
        'Sin firma subida: los certificados salen con el hueco para firmar a mano.',
      ),
    ).toBeVisible();
    await user.upload(
      screen.getByLabelText('Imagen de la firma'),
      new File(['png'], 'firma.png', { type: 'image/png' }),
    );
    await waitFor(() =>
      expect(
        spy.mock.calls.some(
          ([url, init]) =>
            url === '/api/admin/students/certificate-signature' && init?.method === 'POST',
        ),
      ).toBe(true),
    );
    expect(await screen.findByText('Firma subida')).toBeInTheDocument();
  });
});

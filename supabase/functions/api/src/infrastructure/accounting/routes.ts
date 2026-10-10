import { InvalidValue } from '../../domain/common/mod.ts';
import {
  categoryFromName,
  categoryLabel,
  methodFromName,
  methodLabel,
  SupplierInvoiceId,
} from '../../domain/accounting/mod.ts';
import {
  AttachDocument,
  CloseSeason,
  DeleteEntry,
  DeleteInvoice,
  DocumentNotFound,
  type DocumentStorage,
  FiscalYearSummary,
  GetMonthlyCategories,
  MonthLedger,
  PayInvoice,
  RecordEntry,
  RegisterInvoice,
  SetMonthlyCategories,
  SupplierInvoiceNotFound,
  type UploadedDocument,
} from '../../application/accounting/mod.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import {
  SqlAccountingRepository,
  SqlInvoiceQuery,
  SqlLedgerQuery,
} from '../persistence/accounting.ts';
import { SqlClosedPeriods } from '../persistence/billing.ts';

/** El tipo se deduce del contenido, no de lo que declare el navegador. */
export function sniffMimeType(bytes: Uint8Array): string {
  const starts = (...signature: number[]) => signature.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46)) return 'application/pdf';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (
    starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 &&
    bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return 'application/octet-stream';
}

/** `Content-Disposition: inline` con el nombre original (y un nombre de respaldo ASCII, como hace Symfony). */
export function inlineDisposition(originalName: string, fallback: string): string {
  const safe = /^[\x20-\x7e]*$/.test(originalName) && !/["\\%]/.test(originalName)
    ? originalName
    : fallback;
  const header = `inline; filename="${safe}"`;
  return safe === originalName
    ? header
    : `${header}; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}

async function document(form: FormData, required: boolean): Promise<UploadedDocument | null> {
  const file = form.get('file');
  if (!(file instanceof File)) {
    if (required) throw new InvalidValue('file', 'Elige el documento.');
    return null;
  }
  const contents = new Uint8Array(await file.arrayBuffer());
  return { originalName: file.name, mimeType: sniffMimeType(contents), contents };
}

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

/** Rutas de contabilidad: /api/admin/accounting */
export function registerAccountingRoutes(api: ApiApp, storage: DocumentStorage): void {
  registerDomainErrors({
    EntryNotFound: [404, 'not_found'],
    SupplierInvoiceNotFound: [404, 'not_found'],
    DocumentNotFound: [404, 'not_found'],
    SeasonAlreadyClosed: [409, 'season_closed'],
    SeasonNotFinished: [409, 'season_not_finished'],
    PreviousSeasonOpen: [409, 'previous_season_open'],
    InvoiceAlreadyPaid: [409, 'invoice_paid'],
    InvoiceAlreadyPaidCannotBeDeleted: [409, 'invoice_paid'],
  });
  const admin = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, upload = false) => ({
    method,
    path,
    access: 'admin' as const,
    upload,
  });
  const repos = (scope: RequestScope) => ({
    accounting: new SqlAccountingRepository(scope.tx),
    closed: new SqlClosedPeriods(scope.tx),
    ledger: new SqlLedgerQuery(scope.tx),
    summary: new FiscalYearSummary(
      new SqlLedgerQuery(scope.tx),
      new SqlAccountingRepository(scope.tx),
      api.deps.clock,
    ),
  });

  api.defineRoute(admin('GET', '/api/admin/accounting/ledger'), async (c, scope) => {
    const month = c.req.query('month');
    if (!month) throw new InvalidValue('month', 'Indica el mes (AAAA-MM).');
    const view = await new MonthLedger(repos(scope).ledger).execute(month);
    return c.json({
      month: view.month,
      incomeCents: view.incomeCents,
      expenseCents: view.expenseCents,
      expensesByCategory: view.expensesByCategory,
      items: view.lines.map((l) => ({
        ...l,
        categoryLabel: categoryLabel(categoryFromName(l.category)),
        methodLabel: methodLabel(methodFromName(l.method)),
      })),
    });
  });

  api.defineRoute(admin('POST', '/api/admin/accounting/entries'), async (c, scope) => {
    const b = await JsonBody.from(c.req.raw);
    const { accounting, closed } = repos(scope);
    const id = await new RecordEntry(accounting, closed).execute({
      date: b.requiredString('date'),
      kind: b.requiredString('kind'),
      concept: b.requiredString('concept'),
      category: b.requiredString('category'),
      method: b.requiredString('method'),
      amount: b.requiredString('amount'),
      period: b.optionalString('period'),
    });
    return c.json({ id }, 201);
  });

  api.defineRoute(admin('DELETE', '/api/admin/accounting/entries/:id'), async (c, scope) => {
    const { accounting, closed } = repos(scope);
    await new DeleteEntry(accounting, closed).execute(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('GET', '/api/admin/accounting/monthly-categories'), async (c, scope) => {
    const categories = await new GetMonthlyCategories(repos(scope).accounting).execute();
    return c.json({ categories });
  });

  api.defineRoute(admin('PUT', '/api/admin/accounting/monthly-categories'), async (c, scope) => {
    const b = await JsonBody.from(c.req.raw);
    await new SetMonthlyCategories(repos(scope).accounting).execute(b.stringList('categories'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('GET', '/api/admin/accounting/invoices'), async (c, scope) => {
    const items = (await new SqlInvoiceQuery(scope.tx).all()).map((i) => ({
      ...i,
      categoryLabel: categoryLabel(categoryFromName(i.category)),
    }));
    return c.json({ items });
  });

  api.defineRoute(admin('POST', '/api/admin/accounting/invoices', true), async (c, scope) => {
    const form = await c.req.raw.formData();
    const { accounting, closed } = repos(scope);
    const id = await new RegisterInvoice(accounting, storage, closed).execute(
      {
        date: field(form, 'date'),
        number: field(form, 'number'),
        supplier: field(form, 'supplier'),
        concept: field(form, 'concept'),
        category: field(form, 'category'),
        amount: field(form, 'amount'),
        period: field(form, 'period') || null,
      },
      await document(form, false),
    );
    return c.json({ id }, 201);
  });

  api.defineRoute(admin('POST', '/api/admin/accounting/invoices/:id/payment'), async (c, scope) => {
    const b = await JsonBody.from(c.req.raw);
    const { accounting, closed } = repos(scope);
    await new PayInvoice(accounting, closed).execute(
      param(c, 'id'),
      b.requiredString('date'),
      b.optionalString('method') ?? 'transfer',
    );
    return c.body(null, 204);
  });

  api.defineRoute(
    admin('POST', '/api/admin/accounting/invoices/:id/attachment', true),
    async (c, scope) => {
      const form = await c.req.raw.formData();
      const { accounting, closed } = repos(scope);
      const uploaded = await document(form, true);
      if (uploaded === null) throw new InvalidValue('file', 'Elige el documento.');
      await new AttachDocument(accounting, storage, closed).execute(param(c, 'id'), uploaded);
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    admin('GET', '/api/admin/accounting/invoices/:id/attachment'),
    async (c, scope) => {
      const invoice = await repos(scope).accounting.invoice(
        SupplierInvoiceId.fromString(param(c, 'id')),
      );
      if (invoice === null) throw new SupplierInvoiceNotFound();
      const attachment = invoice.attachment();
      if (attachment === null) throw new DocumentNotFound();
      const contents = await storage.read(attachment.key);
      return c.body(contents as unknown as ArrayBuffer, 200, {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': inlineDisposition(attachment.originalName, 'factura'),
        'X-Content-Type-Options': 'nosniff',
      });
    },
  );

  api.defineRoute(admin('DELETE', '/api/admin/accounting/invoices/:id'), async (c, scope) => {
    const { accounting, closed } = repos(scope);
    await new DeleteInvoice(accounting, storage, closed).execute(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('GET', '/api/admin/accounting/years/:year'), async (c, scope) => {
    return c.json(await repos(scope).summary.execute(Number(param(c, 'year'))));
  });

  api.defineRoute(admin('POST', '/api/admin/accounting/years/:year/closing'), async (c, scope) => {
    const { accounting, summary } = repos(scope);
    await new CloseSeason(summary, accounting, api.deps.clock).execute(Number(param(c, 'year')));
    return c.body(null, 204);
  });
}

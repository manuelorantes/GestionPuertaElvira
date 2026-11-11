import { InvalidValue } from '../../domain/common/mod.ts';
import {
  CertificateNotFound,
  DraftCertificate,
  IssueCertificate,
  ReadSignature,
  RemoveSignature,
  type SignatureStorage,
  UpdateCertificateSettings,
  UploadSignature,
} from '../../application/students/certificates.ts';
import { sniffMimeType } from '../accounting/routes.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import { SqlClassQuery } from '../persistence/classes.ts';
import {
  SqlCertificateQuery,
  SqlCertificateRepository,
  SqlCertificateSettingsRepository,
  SqlClubLetterhead,
} from '../persistence/certificates.ts';
import { SqlStudentQuery, SqlStudentRepository } from '../persistence/students.ts';

/** Certificados de matrícula y su firmante: /api/admin/students/:id/certificates y /api/admin/students/certificate-* */
export function registerCertificateRoutes(api: ApiApp, storage: SignatureStorage): void {
  registerDomainErrors({
    CertificateNotFound: [404, 'not_found'],
    SignatureNotFound: [404, 'not_found'],
  });
  const { clock } = api.deps;
  const settings = (scope: RequestScope) => new SqlCertificateSettingsRepository(scope.tx);
  const certificates = (scope: RequestScope) => new SqlCertificateQuery(scope.tx);
  const admin = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, upload = false) =>
    ({ method, path, access: 'admin', upload }) as const;

  /** Un certificado guardado con el membrete del club, listo para imprimir. */
  const view = async (scope: RequestScope, studentId: string, id: string) => {
    const certificate = await certificates(scope).find(studentId, id);
    if (certificate === null) throw new CertificateNotFound();
    return { ...certificate, club: await new SqlClubLetterhead(scope.tx).get() };
  };

  api.defineRoute(admin('GET', '/api/admin/students/certificate-settings'), async (c, scope) => {
    const s = await settings(scope).get();
    return c.json({
      signerName: s.signer.name,
      signerRole: s.signer.role,
      signatureAvailable: s.signature !== null,
    });
  });

  api.defineRoute(admin('PUT', '/api/admin/students/certificate-settings'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await new UpdateCertificateSettings(settings(scope), storage).execute(
      body.requiredString('signerName'),
      body.requiredString('signerRole'),
    );
    return c.body(null, 204);
  });

  api.defineRoute(admin('GET', '/api/admin/students/certificate-signature'), async (c, scope) => {
    const signature = await new ReadSignature(settings(scope), storage).execute();
    return c.body(signature.contents as unknown as ArrayBuffer, 200, {
      'Content-Type': signature.mimeType,
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  api.defineRoute(
    admin('POST', '/api/admin/students/certificate-signature', true),
    async (c, scope) => {
      const file = (await c.req.raw.formData()).get('file');
      if (!(file instanceof File)) throw new InvalidValue('file', 'Adjunta la imagen de la firma.');
      const contents = new Uint8Array(await file.arrayBuffer());
      await new UploadSignature(settings(scope), storage).execute(
        contents,
        sniffMimeType(contents),
      );
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    admin('DELETE', '/api/admin/students/certificate-signature'),
    async (c, scope) => {
      await new RemoveSignature(settings(scope), storage).execute();
      return c.body(null, 204);
    },
  );

  api.defineRoute(admin('GET', '/api/admin/students/:id/certificates/draft'), async (c, scope) => {
    const query = new SqlStudentQuery(scope.tx, new SqlClassQuery(scope.tx));
    return c.json(
      await new DraftCertificate(query, settings(scope), clock).execute(param(c, 'id')),
    );
  });

  api.defineRoute(admin('GET', '/api/admin/students/:id/certificates'), async (c, scope) => {
    return c.json({ items: await certificates(scope).forStudent(param(c, 'id')) });
  });

  api.defineRoute(
    admin('GET', '/api/admin/students/:id/certificates/:certificateId'),
    async (c, scope) => c.json(await view(scope, param(c, 'id'), param(c, 'certificateId'))),
  );

  api.defineRoute(admin('POST', '/api/admin/students/:id/certificates'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    const studentId = param(c, 'id');
    const id = await new IssueCertificate(
      new SqlStudentRepository(scope.tx),
      new SqlCertificateRepository(scope.tx),
      settings(scope),
    ).execute(
      studentId,
      {
        nationalId: body.optionalString('nationalId'),
        periodKind: body.requiredString('periodKind'),
        period: body.requiredString('period'),
        memberSince: body.optionalString('memberSince'),
        schedule: body.requiredString('schedule'),
        place: body.requiredString('place'),
        issuedOn: body.requiredString('issuedOn'),
        signerName: body.requiredString('signerName'),
        signerRole: body.requiredString('signerRole'),
        signed: body.bool('signed'),
      },
      scope.user?.id ?? null,
    );
    return c.json(await view(scope, studentId, id.value), 201);
  });
}

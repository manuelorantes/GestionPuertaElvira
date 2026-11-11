import { SIGNATURE_URL, type PrintableCertificate } from '@/features/students/certificates';
import { ClubLogo } from '@/shared/ui/ClubLogo';

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** «11 de noviembre de 2026». */
function longDate(iso: string): string {
  const [year = '', month = '1', day = '1'] = iso.split('-');
  return `${Number(day)} de ${MONTHS[Number(month) - 1] ?? ''} de ${year}`;
}

/**
 * El certificado como papel oficial del club: el logo y los datos del club arriba, el texto y la firma (escaneada o en
 * blanco para firmar a mano). Al imprimir solo sale esta hoja.
 */
export function CertificateSheet({ certificate: c }: { certificate: PrintableCertificate }) {
  return (
    <article
      aria-label="Certificado"
      className="receipt-sheet mx-auto flex max-w-[680px] flex-col rounded-sm border border-line bg-white px-10 py-9 text-[15px] leading-relaxed text-ink print:max-w-none print:px-4 print:py-0"
    >
      <header className="flex items-center gap-4 border-b-4 border-brand pb-4">
        <ClubLogo size={72} />
        <div>
          <p className="font-display text-2xl leading-tight font-bold tracking-[0.04em] uppercase">
            {c.club.name}
          </p>
          <p className="text-[13px] text-ink-muted">
            NIF {c.club.taxId} · {c.club.address}
          </p>
        </div>
      </header>
      <h1 className="mt-10 mb-8 text-center font-display text-2xl font-bold tracking-[0.08em] uppercase">
        Certificado de matrícula
      </h1>
      <p>
        <strong>{c.signer.name}</strong>, {c.signer.role} del {c.club.name},
      </p>
      <p className="my-5 font-bold tracking-[0.08em]">CERTIFICA:</p>
      <p className="text-justify">
        Que <strong>{c.studentName}</strong>, con DNI <strong>{c.nationalId}</strong>, tiene
        matrícula en el {c.club.name} para el curso <strong>{c.season}</strong>, en horario de clase{' '}
        {c.schedule}, y pertenece al club desde el {longDate(c.memberSince)}.
      </p>
      <p className="mt-8">
        En {c.place}, a {longDate(c.issuedOn)}.
      </p>
      <div className="mt-6 flex flex-col items-center self-end text-center">
        <div className="flex h-32 w-64 items-end justify-center">
          {c.signed && (
            <img
              src={SIGNATURE_URL}
              alt={`Firma de ${c.signer.name}`}
              className="max-h-32 max-w-64 object-contain"
            />
          )}
        </div>
        <p className="mt-1 min-w-64 border-t border-ink pt-1">Fdo.: {c.signer.name}</p>
        <p className="text-[13px]">{c.signer.role}</p>
      </div>
    </article>
  );
}

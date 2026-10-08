import { useSession } from '@/features/auth/useSession';
import { Card } from '@/shared/ui/Card';

/** Portada de una cuenta de profesorado: sus clases para pasar lista (o el aviso de cuenta sin vincular). */
export function TeacherHomePage() {
  const { data: user } = useSession();
  const firstName = user?.fullName.split(' ')[0] ?? '';
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 md:px-8 md:py-8">
      <div>
        <p className="text-sm text-ink-muted">Hola, {firstName}</p>
        <h1 className="font-display text-[28px] font-bold tracking-[0.04em] text-ink-strong uppercase">
          Mis clases
        </h1>
      </div>
      {user?.teacherId ? null : (
        <Card className="px-5 py-6">
          <p className="font-semibold">Tu cuenta aún no está vinculada a ningún profesor.</p>
          <p className="mt-1 text-sm text-ink-muted">
            Pide a administración que la vincule para ver tus clases, tus alumnos y tus pagos.
          </p>
        </Card>
      )}
    </main>
  );
}

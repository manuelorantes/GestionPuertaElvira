import { useSession } from '@/features/auth/useSession';
import { Alert } from '@/shared/ui/Alert';

export function PanelHomePage() {
  const { data: user } = useSession();
  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <div>
        <p className="text-sm text-ink-muted">Octubre 2026 · temporada 2026/27</p>
        <h1 className="font-display text-[28px] font-bold tracking-[0.04em] text-ink-strong uppercase">
          Resumen del club
        </h1>
      </div>
      <p className="text-lg text-ink">Hola, {firstName}</p>
      <Alert tone="info">Las secciones de gestión llegarán en las próximas entregas.</Alert>
    </main>
  );
}

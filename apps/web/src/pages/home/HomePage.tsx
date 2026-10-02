import { ApiStatus } from './ApiStatus';

export function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <img
        src="/img/logo.png"
        alt="Club Ajedrez Puerta Elvira"
        width={120}
        height={120}
        className="rounded-full shadow-card"
      />
      <div>
        <p className="font-display text-sm font-semibold tracking-[0.12em] text-brand uppercase">
          Temporada 2026/2027
        </p>
        <h1 className="font-display text-4xl font-bold tracking-wide text-ink-strong uppercase">
          Club Ajedrez <span className="text-brand">Puerta Elvira</span>
        </h1>
      </div>
      <ApiStatus />
    </main>
  );
}

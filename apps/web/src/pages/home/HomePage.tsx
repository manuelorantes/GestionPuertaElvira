import { useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

import type { SessionUser } from '@/features/auth/api';
import { LoginDialog } from '@/features/auth/LoginDialog';
import { CHANGE_PASSWORD_PATH } from '@/features/auth/RequireSession';
import { useSession } from '@/features/auth/useSession';
import { usePublicPrices } from '@/features/public/prices';
import { Button } from '@/shared/ui/Button';

import { ApiStatus } from './ApiStatus';
import { HomeHeader } from './HomeHeader';
import { PricesSection } from './PricesSection';

/** Temporada que se anuncia: desde julio, la que empieza en septiembre. */
function seasonLabel(today = new Date()): string {
  const start = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  return `${start}/${start + 1}`;
}

const ACCESS_PARAM = 'acceso';

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: user } = useSession();
  const isDialogOpen = searchParams.get(ACCESS_PARAM) === '1' && !user;
  const requestedPanelPath = (location.state as { from?: string } | null)?.from ?? '/panel';
  const pricesRef = useRef<HTMLElement>(null);
  const prices = usePublicPrices();
  const season = seasonLabel();

  function openAccess() {
    if (user) {
      void navigate('/panel');
      return;
    }
    setSearchParams({ [ACCESS_PARAM]: '1' });
  }

  function enterPanel(loggedIn: SessionUser) {
    void navigate(loggedIn.mustChangePassword ? CHANGE_PASSWORD_PATH : requestedPanelPath, {
      replace: true,
    });
  }

  return (
    <div className="min-h-screen">
      <HomeHeader onAccess={openAccess} />
      <main>
        <section className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-12 px-4 py-16 md:px-12">
          <div className="min-w-0 flex-[1_1_380px]">
            <p className="mb-4 text-[13px] font-semibold tracking-[0.08em] text-brand uppercase">
              Temporada {season}
            </p>
            <h1 className="font-display text-[clamp(48px,7vw,88px)] leading-[0.95] font-bold tracking-[0.02em] text-ink-strong uppercase">
              Club Ajedrez <br />
              <span className="text-brand">Puerta Elvira</span>
            </h1>
            <p className="mt-6 font-serif text-[22px] leading-snug font-medium tracking-[0.06em] text-ink-strong uppercase">
              Entrena tu mente, <br />
              domina el tablero
            </p>
            <p className="mt-6 max-w-[460px] text-[17px] text-ink-soft">
              Clases semanales en grupo y clases particulares, de lunes a viernes, para todas las
              edades.
            </p>
            <Button
              size="lg"
              className="mt-8"
              onClick={() => pricesRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              Ver precios {prices.data?.season ?? season.replace(/\/\d\d(\d\d)$/, '/$1')}
            </Button>
          </div>
          <div className="min-w-0 flex-[1_1_380px]">
            <img
              src="/img/foto-club.jpg"
              alt="Alumna jugando una partida en el club"
              className="block aspect-square w-full rounded-md object-cover shadow-overlay"
            />
          </div>
        </section>
        <PricesSection ref={pricesRef} />
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t-[6px] border-brand bg-ink-strong px-4 py-6 text-sm text-line-strong md:px-12">
        <p className="font-serif tracking-[0.06em] text-paper">Club Ajedrez Puerta Elvira</p>
        <p>Gracias por vuestra confianza y por formar parte de este proyecto.</p>
        <ApiStatus />
      </footer>
      <LoginDialog
        open={isDialogOpen}
        onClose={() => setSearchParams({})}
        onLoggedIn={enterPanel}
      />
    </div>
  );
}

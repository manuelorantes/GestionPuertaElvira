import { useLocation, useNavigate, useSearchParams } from 'react-router';

import type { SessionUser } from '@/features/auth/api';
import { LoginDialog } from '@/features/auth/LoginDialog';
import { CHANGE_PASSWORD_PATH } from '@/features/auth/RequireSession';
import { useSession } from '@/features/auth/useSession';

import { ApiStatus } from './ApiStatus';
import { HomeHeader } from './HomeHeader';

const ACCESS_PARAM = 'acceso';

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: user } = useSession();
  const isDialogOpen = searchParams.get(ACCESS_PARAM) === '1' && !user;
  const requestedPanelPath = (location.state as { from?: string } | null)?.from ?? '/panel';

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
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 text-center">
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
      <LoginDialog
        open={isDialogOpen}
        onClose={() => setSearchParams({})}
        onLoggedIn={enterPanel}
      />
    </div>
  );
}

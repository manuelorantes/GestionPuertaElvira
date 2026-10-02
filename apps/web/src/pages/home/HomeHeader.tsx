import { Lock } from 'lucide-react';

import { Button } from '@/shared/ui/Button';
import { ClubLogo } from '@/shared/ui/ClubLogo';

interface HomeHeaderProps {
  onAccess: () => void;
}

export function HomeHeader({ onAccess }: HomeHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line-soft bg-paper px-4 py-4 md:px-12">
      <div className="flex items-center gap-3">
        <ClubLogo size={44} />
        <p className="font-display text-xl leading-none font-bold tracking-[0.06em] text-ink-strong uppercase">
          Club Ajedrez
          <br />
          <span className="text-brand">Puerta Elvira</span>
        </p>
      </div>
      <Button variant="outline" onClick={onAccess} className="h-10">
        <Lock aria-hidden size={18} />
        Acceso administración
      </Button>
    </header>
  );
}

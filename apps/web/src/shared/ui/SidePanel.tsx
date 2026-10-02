import { useEffect, useRef, type ReactNode } from 'react';

interface SidePanelProps {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}

/** Ficha lateral (escritorio) o a pantalla completa (móvil). */
export function SidePanel({ labelledBy, onClose, children }: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Esc se escucha en el documento: el foco puede haber caído fuera (p. ej. si desaparece el botón pulsado).
  // Los diálogos superiores marcan el evento como gestionado para no cerrar también la ficha.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-ink-strong/40" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="h-full w-full overflow-y-auto bg-paper shadow-overlay outline-none md:max-w-[560px]"
      >
        {children}
      </div>
    </div>
  );
}

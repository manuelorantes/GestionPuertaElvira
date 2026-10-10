import { useEffect, useRef, type ReactNode } from 'react';

interface SidePanelProps {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  /** Algo en la zona gris de fuera (p. ej. «Ir a Alumnos»); pulsar en el resto de esa zona cierra la ficha. */
  aside?: ReactNode;
}

/** Ficha lateral (escritorio) o a pantalla completa (móvil). */
export function SidePanel({ labelledBy, onClose, children, aside }: SidePanelProps) {
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
    <div
      data-testid="fondo-ficha"
      className="fixed inset-0 z-20 flex flex-col bg-ink-strong/40 md:flex-row md:justify-end"
      onClick={onClose}
    >
      {aside && (
        // En el móvil, una franja encima de la ficha; en escritorio, a su izquierda.
        <div className="flex shrink-0 justify-end px-4 py-2 md:flex-1 md:items-start md:py-4">
          <span onClick={(event) => event.stopPropagation()}>{aside}</span>
        </div>
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="min-h-0 w-full flex-1 overflow-y-auto bg-paper shadow-overlay outline-none md:h-full md:max-w-[560px] md:flex-none"
      >
        {children}
      </div>
    </div>
  );
}

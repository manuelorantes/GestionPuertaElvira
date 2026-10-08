import { useEffect, useId, useState, type ReactNode } from 'react';

const WIDTH = 320;

/**
 * Asterisco que al pincharlo abre una nota pequeña (se cierra con Escape, pinchando fuera o al desplazar). La nota va
 * en posición fija para que no la recorten las tarjetas con desplazamiento.
 */
export function AsteriskNote({ label, children }: { label: string; children: ReactNode }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const id = useId();

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(`[data-asterisk-note="${id}"]`)) {
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchor, id]);

  return (
    <span data-asterisk-note={id}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={anchor !== null}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
        className="ml-1 cursor-pointer rounded-sm px-1 font-semibold text-brand hover:bg-surface-muted"
      >
        *
      </button>
      {anchor && (
        <span
          role="dialog"
          aria-label={label}
          style={{
            top: anchor.bottom + 4,
            left: Math.max(8, Math.min(anchor.left, window.innerWidth - WIDTH - 8)),
            maxWidth: WIDTH,
          }}
          className="fixed z-20 block rounded-sm border border-line-strong bg-surface-raised px-3 py-2 text-left text-[13px] font-normal text-ink shadow-overlay"
        >
          {children}
        </span>
      )}
    </span>
  );
}

import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Ancho del panel (`w-64`), para que no se salga por la derecha en pantallas estrechas. */
const MENU_WIDTH = 256;

/** Los valores que se pueden mostrar u ocultar en una columna; `selected` vacío es mostrarlos todos. */
export interface ColumnFilter<V extends string = string> {
  options: { value: V; label: string; count?: number }[];
  selected: V[];
  onChange: (selected: V[]) => void;
}

/** Una forma de ordenar que se elige en el menú. */
export interface SortChoice {
  label: string;
  checked: boolean;
  onSelect: () => void;
}

/**
 * Cabecera de una columna que ordena y filtra (la de toda la aplicación cuando una columna tiene filtro): al pincharla
 * abre un menú con las formas de ordenar y los valores que hay, para mostrar solo los elegidos. La flecha indica que
 * la tabla está ordenada por esta columna y el número, cuántos valores hay elegidos.
 */
export function ColumnMenu({
  label,
  name,
  sorted,
  sorts,
  filter,
}: {
  label: string;
  /** Para «Ordenar y filtrar por …» (lectores de pantalla). */
  name: string;
  /** El sentido si la tabla está ordenada por esta columna; null si no. */
  sorted: 'ascending' | 'descending' | null;
  sorts: SortChoice[];
  filter: ColumnFilter;
}) {
  const [open, setOpen] = useState(false);
  const radioName = useId();
  const button = useRef<HTMLButtonElement>(null);
  // El panel se pinta fuera de la tabla, fijo bajo el botón: la tabla se desplaza en horizontal y recortaría el panel
  // cuando hay pocas filas. Si la página se mueve o cambia de tamaño, se cierra en vez de quedarse descolocado.
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  const toggleOpen = () => {
    const rect = button.current?.getBoundingClientRect();
    if (rect) {
      setPosition({
        top: rect.bottom + 8,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8)),
      });
    }
    setOpen(!open);
  };
  const { options, selected, onChange } = filter;
  const active = selected.length > 0 || sorted !== null;
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const SortIcon = sorted === 'descending' ? ArrowDown : ArrowUp;

  return (
    <span className="relative inline-block">
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={toggleOpen}
        className={`inline-flex cursor-pointer items-center gap-1 text-xs font-semibold tracking-[0.06em] uppercase hover:text-ink ${active ? 'text-ink' : 'text-ink-muted'}`}
      >
        {label}
        {selected.length > 0 && <span className="normal-case">({selected.length})</span>}
        {sorted && <SortIcon aria-hidden size={13} className="shrink-0" />}
        <ChevronDown aria-hidden size={13} className="shrink-0" />
      </button>
      {open &&
        createPortal(
          <>
            <button
              type="button"
              aria-label={`Cerrar el menú de ${name}`}
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div
              role="dialog"
              aria-label={`Ordenar y filtrar por ${name}`}
              onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
              style={position}
              className="fixed z-20 flex w-64 flex-col gap-3 rounded-sm border border-line-strong bg-surface-raised p-3 text-sm font-normal tracking-normal normal-case shadow-overlay"
            >
              <div role="group" aria-label="Ordenar" className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
                  Ordenar
                </span>
                {sorts.map((choice) => (
                  <label key={choice.label} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name={radioName}
                      checked={choice.checked}
                      onChange={choice.onSelect}
                    />
                    {choice.label}
                  </label>
                ))}
              </div>
              <div role="group" aria-label="Filtrar" className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
                  Mostrar
                </span>
                <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                  {options.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(option.value)}
                        onChange={() => toggle(option.value)}
                        className="mt-1"
                      />
                      <span>
                        {option.label}
                        {option.count !== undefined && (
                          <span className="text-ink-muted"> ({option.count})</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                {selected.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="cursor-pointer self-start text-[13px] font-semibold text-brand"
                  >
                    Ver todos
                  </button>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </span>
  );
}

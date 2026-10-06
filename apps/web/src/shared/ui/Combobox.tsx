import { ChevronDown, X } from 'lucide-react';
import { useId, useState } from 'react';

interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  label: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Cada palabra escrita debe aparecer en la etiqueta, sin distinguir mayúsculas ni tildes. */
function matches(label: string, search: string): boolean {
  const words = fold(search).split(/\s+/).filter(Boolean);
  const text = fold(label);
  return words.every((w) => text.includes(w));
}

/**
 * Desplegable con búsqueda: al abrirlo salen todas las opciones y, según se escribe, se reducen.
 * Elegir una la deja escrita en el campo; borrar el texto deshace la elección.
 */
export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder = 'Escribe para buscar…',
  emptyText = 'Nada coincide',
}: ComboboxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const selected = options.find((o) => o.value === value);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Con una opción elegida y sin búsqueda en curso, el campo muestra la elección.
  const text = selected && search === '' ? selected.label : search;
  const visible = options.filter((o) => search === '' || matches(o.label, search));

  const choose = (option: ComboboxOption) => {
    onChange(option.value);
    setSearch('');
    setOpen(false);
  };
  const clear = () => {
    onChange('');
    setSearch('');
    setActive(0);
  };

  return (
    <div className="relative flex w-full min-w-0 flex-col gap-1.5 text-left">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && visible[active] ? `${id}-${visible[active].value}` : undefined
          }
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            if (selected) onChange('');
            setSearch(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, visible.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && open && visible[active]) {
              e.preventDefault();
              choose(visible[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="h-11 w-full rounded-sm border border-line-strong bg-surface pr-10 pl-3 text-[15px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        {text ? (
          <button
            type="button"
            aria-label="Borrar"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-ink-muted hover:bg-surface-muted"
          >
            <X aria-hidden size={16} />
          </button>
        ) : (
          <ChevronDown
            aria-hidden
            size={16}
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
          />
        )}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute top-full right-0 left-0 z-10 mt-1 max-h-64 overflow-y-auto rounded-sm border border-line-strong bg-surface-raised py-1 shadow-overlay"
        >
          {visible.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-muted" aria-disabled>
              {emptyText}
            </li>
          )}
          {visible.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-${option.value}`}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                index === active ? 'bg-surface-muted' : ''
              } ${option.value === value ? 'font-semibold' : ''}`}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

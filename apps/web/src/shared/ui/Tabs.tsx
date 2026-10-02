import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  label: string;
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
  children: ReactNode;
}

/** Pestañas accesibles (subrayado verde en la activa, como en el diseño). */
export function Tabs({ label, tabs, value, onChange, children }: TabsProps) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const index = tabs.findIndex((tab) => tab.id === value);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (!next) return;
    onChange(next.id);
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${baseId}-${next.id}`)}`)?.focus();
  }

  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={handleKeyDown}
        className="mb-6 flex gap-6 overflow-x-auto border-b border-line-soft"
      >
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              id={`${baseId}-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={`-mb-px h-11 shrink-0 cursor-pointer border-b-2 px-1 text-[15px] ${
                selected
                  ? 'border-brand font-semibold text-brand-strong'
                  : 'border-transparent font-medium text-ink-muted'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${value}`}>
        {children}
      </div>
    </div>
  );
}

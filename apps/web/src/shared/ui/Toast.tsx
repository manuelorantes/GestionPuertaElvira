import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const ToastContext = createContext<(message: string) => void>(() => {});

const VISIBLE_MS = 2800;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; key: number } | null>(null);
  const show = useCallback((text: string) => setMessage({ text, key: Date.now() }), []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6"
      >
        {message && (
          <p
            key={message.key}
            role="status"
            className="rounded-sm bg-ink-strong px-4 py-3 text-sm font-medium text-paper shadow-overlay"
          >
            {message.text}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(ToastContext);
}

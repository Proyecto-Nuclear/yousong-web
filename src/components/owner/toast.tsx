"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { CheckIcon, CloseIcon } from "../icons";

interface Toast {
  id: number;
  text: string;
}
type Notify = (text: string) => void;

const ToastContext = createContext<Notify | null>(null);

/** Returns the toast notifier, or null when no provider is mounted. */
export function useNotify() {
  return useContext(ToastContext);
}

const TOAST_MS = 6000;

type SetToasts = (update: (list: Toast[]) => Toast[]) => void;

/**
 * Toast actions built once per provider from the (stable) state setter.
 * ToastProvider creates them in a useState initializer, so their identity
 * never changes between renders, with or without the React Compiler; effects
 * that depend on `notify` (list-configuration) therefore cannot loop.
 */
export function createToastActions(setToasts: SetToasts) {
  let next = 0;
  return {
    notify(text: string) {
      if (!text) return;
      const id = ++next;
      // Same text twice in a row restarts instead of stacking duplicates.
      setToasts((list) =>
        [...list.filter((t) => t.text !== text), { id, text }].slice(-3),
      );
    },
    dismiss(id: number) {
      setToasts((list) => list.filter((toast) => toast.id !== id));
    },
  };
}

// One polite live region for confirmations across the panel. Errors use
// role="alert" callouts in their own area; toasts never carry errors.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [actions] = useState(() => createToastActions(setToasts));
  return (
    <ToastContext.Provider value={actions.notify}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={actions.dismiss} />
    </ToastContext.Provider>
  );
}

export function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <output className="toaster" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </output>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held) return;
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [held, toast.id, onDismiss]);
  return (
    <div className="toast">
      <CheckIcon size={20} />
      <p className="toast__text">{toast.text}</p>
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        aria-label={`Cerrar aviso: ${toast.text}`}
        // Keyboard users reading the toast keep it on screen.
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
        onClick={() => onDismiss(toast.id)}
      >
        <CloseIcon size={20} />
      </button>
    </div>
  );
}

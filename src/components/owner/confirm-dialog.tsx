"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

type DialogLike = Pick<HTMLDialogElement, "open" | "showModal" | "close">;

/** Keeps the native dialog in step with the `open` prop (idempotent). */
export function syncDialog(dialog: DialogLike | null, open: boolean) {
  if (!dialog) return;
  if (open && !dialog.open) dialog.showModal();
  if (!open && dialog.open) dialog.close();
}

/**
 * Escape fires `cancel`. The native close is always prevented so the parent
 * stays the single owner of `open`; while busy, Escape does nothing.
 */
export function cancelDialog(
  event: { preventDefault: () => void },
  busy: boolean,
  onCancel: () => void,
) {
  event.preventDefault();
  if (!busy) onCancel();
}

// Modal confirmation built on <dialog>.showModal(): the browser traps focus,
// makes the rest of the page inert and closes on Escape (reported as cancel).
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const textId = useId();
  useEffect(() => syncDialog(ref.current, open), [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={textId}
      onCancel={(event) => cancelDialog(event, busy, onCancel)}
    >
      <h2 id={titleId} className="dialog__title">
        {title}
      </h2>
      <div id={textId} className="dialog__text">
        {children}
      </div>
      <div className="dialog__actions">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={busy}
          // biome-ignore lint/a11y/noAutofocus: inside a modal dialog, focus must land on the safe choice when it opens.
          autoFocus
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn ${tone === "danger" ? "btn--danger" : "btn--primary"}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Un momento…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

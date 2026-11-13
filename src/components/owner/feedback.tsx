import type { ReactNode } from "react";
import { ownerError } from "../../lib/owner-copy";
import { AlertIcon } from "../icons";

/** Error card: what happened and what to do, always owner-safe text. */
export function ErrorCallout({
  error,
  action,
}: {
  error: unknown;
  action?: ReactNode;
}) {
  return (
    <div className="callout callout--error" role="alert">
      <AlertIcon size={20} />
      <div className="callout__body">
        <p>{ownerError(error)}</p>
        {action}
      </div>
    </div>
  );
}

/** Quiet, non-announcing loading marker for an area that sets aria-busy. */
export function Loading({ label = "Cargando…" }: { label?: string }) {
  return <p className="loading-text">{label}</p>;
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders.
        <div className="skeleton" key={index}>
          <span className="skeleton__block" />
          <span className="skeleton__block skeleton__block--cover" />
          <span className="skeleton__lines">
            <span className="skeleton__block" />
            <span className="skeleton__block" />
          </span>
          <span className="skeleton__block skeleton__block--round" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <p className="empty__text">{children}</p>}
      {action}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { OperationGate } from "../../lib/demo-operation";
import { ErrorCallout, Loading } from "./feedback";
import { useNotify } from "./toast";

export function useOwnerOperation() {
  const [gate] = useState(() => new OperationGate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNoticeText] = useState("");
  const notify = useNotify();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      gate.invalidate();
    };
  }, [gate]);
  // Confirmations go to the shared toast region when mounted under it;
  // otherwise (isolated renders) they stay local for OperationStatus.
  const setNotice = (text: string) => {
    if (notify) {
      if (text) notify(text);
    } else setNoticeText(text);
  };
  async function run(
    task: (commit: (update: () => void) => void) => Promise<void>,
  ) {
    const ticket = gate.begin();
    if (ticket === null) return;
    setBusy(true);
    setError("");
    setNoticeText("");
    const commit = (update: () => void) => {
      if (mounted.current && gate.valid(ticket)) update();
    };
    try {
      await task(commit);
    } catch (reason) {
      // Raw text is kept only for mapping; rendering always uses ownerError.
      commit(() =>
        setError(reason instanceof Error ? reason.message : "Sin detalle"),
      );
    } finally {
      commit(() => setBusy(false));
      gate.end(ticket);
    }
  }
  return { busy, error, notice, setNotice, run, gate };
}

/** Busy text (not announced), owner-safe error card, local confirmation. */
export function OperationStatus({
  busy,
  error,
  notice,
}: {
  busy: boolean;
  error: string;
  notice: string;
}) {
  return (
    <>
      {busy && <Loading />}
      {error && <ErrorCallout error={error} />}
      {!busy && notice && (
        <output className="callout callout--success">{notice}</output>
      )}
    </>
  );
}

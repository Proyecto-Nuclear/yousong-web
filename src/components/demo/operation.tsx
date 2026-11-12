"use client";

import { useEffect, useRef, useState } from "react";
import { OperationGate } from "@/lib/demo-operation";

export function useDemoOperation() {
  const [gate] = useState(() => new OperationGate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      gate.invalidate();
    };
  }, [gate]);
  async function run(
    task: (commit: (update: () => void) => void) => Promise<void>,
  ) {
    const ticket = gate.begin();
    if (ticket === null) return;
    setBusy(true);
    setError("");
    setNotice("");
    const commit = (update: () => void) => {
      if (mounted.current && gate.valid(ticket)) update();
    };
    try {
      await task(commit);
    } catch (reason) {
      commit(() =>
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo completar la operación.",
        ),
      );
    } finally {
      commit(() => setBusy(false));
      gate.end(ticket);
    }
  }
  return { busy, error, notice, setNotice, run, gate };
}
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
      <output>{busy ? "Consultando el servidor…" : notice}</output>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

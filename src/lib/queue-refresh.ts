import type { Queue } from "./demo-contracts";
import type { OperationGate } from "./demo-operation";

interface QueueRead {
  read: () => Promise<Queue>;
  gate: OperationGate;
  commit: (update: () => void) => void;
  accept: (snapshot: Queue) => void;
  stale: () => void;
}

export async function refreshQueue({
  read,
  gate,
  commit,
  accept,
  stale,
}: QueueRead) {
  let active = false;
  commit(() => {
    active = true;
  });
  if (!active) return;
  try {
    const value = await read();
    commit(() => {
      if (gate.acceptVersion(value.colaVersion)) accept(value);
      else stale();
    });
  } catch {
    commit(stale);
  }
}

export interface RefreshClock {
  schedule: (task: () => void, delay: number) => unknown;
  cancel: (handle: unknown) => void;
}

const clock: RefreshClock = {
  schedule: (task, delay) => setTimeout(task, delay),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

// Completion-based scheduling keeps slow reads serial. Disposal fences the next
// tick; the caller's operation gate fences the response already in flight.
export function startQueueRefresh(
  read: () => Promise<void>,
  timer: RefreshClock = clock,
) {
  let stopped = false;
  let handle: unknown;
  async function tick() {
    if (stopped) return;
    try {
      await read();
    } catch {
      // The read boundary presents a stale hint; failure must not stop polling.
    } finally {
      if (!stopped) handle = timer.schedule(() => void tick(), 6000);
    }
  }
  void tick();
  return () => {
    stopped = true;
    timer.cancel(handle);
  };
}

import type { Session } from "../../lib/admin-api";
import { NIGHT_NOT_OPEN, sessionNotice } from "../../lib/owner-copy";

/** Top-bar chip with the music night's state (never the account login). */
export function NightChip({ session }: { session: Session | null }) {
  const tone =
    session?.estado === "ABIERTA"
      ? "chip--live"
      : session?.estado === "PAUSADA"
        ? "chip--paused"
        : "chip--off";
  return (
    <span className={`chip chip--compact ${tone}`}>
      <span className="chip__text">
        {session ? sessionNotice(session.estado) : NIGHT_NOT_OPEN}
      </span>
    </span>
  );
}

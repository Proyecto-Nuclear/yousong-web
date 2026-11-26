// Deterministic generated cover art for queue and list rows (search results
// use validated YouTube thumbnails, see README): an abstract tile derived from
// the title, so the same title gets the same tile on every screen and reload.

// Palettes come from the "Noche de verbena" tokens (globals.css): night planes,
// mango, aqua and the violet/lilac accents. Covers are decorative only.
export const COVER_PALETTES = [
  { ground: "#2A2243", ink: "#FFB547", detail: "#F6F1FF" }, // mango on night
  { ground: "#14101F", ink: "#3DD6C6", detail: "#FFB547" }, // aqua on night
  { ground: "#5B3FD0", ink: "#F6F1FF", detail: "#3DD6C6" }, // violet
  { ground: "#FFB547", ink: "#1B1530", detail: "#5B3FD0" }, // mango ground
  { ground: "#3DD6C6", ink: "#1B1530", detail: "#F6F1FF" }, // aqua ground
  { ground: "#ECE6F6", ink: "#5B3FD0", detail: "#FFB547" }, // pale lilac
] as const;

export const COVER_MOTIFS = [
  "arch",
  "orbit",
  "peaks",
  "leaves",
  "bands",
] as const;
export type CoverMotif = (typeof COVER_MOTIFS)[number];

/** FNV-1a 32-bit: tiny, stable across runtimes, good enough to spread titles. */
export function hashText(text: string) {
  let hash = 0x811c9dc5;
  for (const char of text.normalize("NFC")) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function coverFor(seed: string) {
  const hash = hashText(seed.trim().toLowerCase() || "yousong");
  return {
    palette: COVER_PALETTES[hash % COVER_PALETTES.length],
    motif: COVER_MOTIFS[(hash >>> 8) % COVER_MOTIFS.length],
    mirrored: ((hash >>> 16) & 1) === 1,
  };
}

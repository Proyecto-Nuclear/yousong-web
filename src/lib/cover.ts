// Deterministic generated cover art. Remote thumbnails are intentionally not
// fetched (see README), so each song gets an abstract tile derived from its
// title: same title, same tile, on every screen and every reload.

export const COVER_PALETTES = [
  { ground: "#2F4A2C", ink: "#CBDDB0", detail: "#E9F0DC" }, // sage
  { ground: "#1E3550", ink: "#B8D8FF", detail: "#E4F0FF" }, // night blue
  { ground: "#4A2F26", ink: "#D8A98C", detail: "#F3DDCF" }, // clay
  { ground: "#CBDDB0", ink: "#2F4A2C", detail: "#1E3550" }, // pale sage
  { ground: "#B8D8FF", ink: "#1E3550", detail: "#4A2F26" }, // pale blue
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

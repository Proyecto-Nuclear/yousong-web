// Pure computations for the Analítica view, so formatting rules stay testable.
import type { Highlights } from "./demo-contracts";
import { genreLabel, plural } from "./format";

/**
 * Bar width in percent relative to the list's top value. Any nonzero value
 * stays visible (at least 4%); the exact number is always shown as text.
 */
export function barShare(value: number, max: number) {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.max(4, Math.min(100, Math.round((value / max) * 100)));
}

export const periodLabel = (days: number) =>
  days === 1 ? "Último día" : `Últimos ${days} días`;
export const votesValue = (count: number) => plural(count, "voto");
export const timesValue = (count: number) => plural(count, "vez", "veces");

export interface GenreShare {
  genero: string;
  veces: number;
  /** Share of all requests with a known genre, 0..100 (rounded). */
  share: number;
}

/**
 * "Géneros más pedidos": request counts per genre from the most requested
 * songs. Songs without genre are left out; empty when no genre is known.
 */
export function topGenres(
  requested: Highlights["masPedidas"],
  limit = 5,
): GenreShare[] {
  const totals = new Map<string, number>();
  for (const item of requested) {
    const genre = genreLabel(item.cancion.genero);
    if (genre && item.veces > 0)
      totals.set(genre, (totals.get(genre) ?? 0) + item.veces);
  }
  const all = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return [...totals]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, limit)
    .map(([genero, veces]) => ({
      genero,
      veces,
      share: Math.round((veces / all) * 100),
    }));
}

/** When a song played: relative for today, otherwise a short local date. */
export function playedAgo(iso: string, now: number, timeZone?: string) {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "Hora sin confirmar";
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return "Hace un momento";
  if (minutes < 60) return `Hace ${minutes} min`;
  if (minutes < 24 * 60) return `Hace ${Math.floor(minutes / 60)} h`;
  return new Date(at).toLocaleString("es", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function hasHighlights(value: Highlights) {
  return (
    value.masVotadas.length +
      value.masPedidas.length +
      value.masSonadas.length +
      value.ultimasSonadas.length >
    0
  );
}

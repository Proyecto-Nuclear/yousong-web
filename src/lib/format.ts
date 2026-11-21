// Owner-facing formatting helpers. Pure functions so copy rules stay testable.

/** Formats seconds as `m:ss` (or `h:mm:ss`); null when the duration is unknown. */
export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds))
    return null;
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

/** Singular/plural Spanish label: plural(1, "voto") -> "1 voto". */
export function plural(count: number, singular: string, pluralForm?: string) {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

export const votesLabel = (count: number) => plural(count, "voto");
export const songsLabel = (count: number) =>
  plural(count, "canción", "canciones");

/** "Artista · 3:34", or just the artist when the duration is unknown. */
export function songMeta(artist: string, seconds: number | null | undefined) {
  const duration = formatDuration(seconds);
  return duration ? `${artist} · ${duration}` : artist;
}

/** Displayable genre label, or null when missing, null or blank. */
export function genreLabel(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

/** Estimated wait as shown next to each queued song. */
export function waitLabel(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds))
    return "Espera por calcular";
  if (seconds <= 0) return "Sin espera";
  return `Espera ~ ${Math.ceil(seconds / 60)} min`;
}

/** Operating date "2026-11-13" as "Noche del viernes 13 de noviembre". */
export function nightLabel(operatingDate: string) {
  const date = new Date(`${operatingDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Noche de hoy";
  const text = date.toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return `Noche del ${text.replace(",", "")}`;
}

/** Relative freshness label for automatic reads. */
export function updatedLabel(elapsedMs: number) {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (seconds < 5) return "Actualizado ahora";
  if (seconds < 60) return `Actualizado hace ${seconds} s`;
  return `Actualizado hace ${Math.floor(seconds / 60)} min`;
}

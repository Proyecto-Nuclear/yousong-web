import { formatDuration, genreLabel } from "../../lib/format";

/** Small genre tag; renders nothing when the genre is unknown. */
export function GenreTag({ genre }: { genre: string | null | undefined }) {
  const label = genreLabel(genre);
  if (!label) return null;
  return (
    <span className="tag" title={label}>
      <span className="sr-only">Género: </span>
      {label}
    </span>
  );
}

/**
 * Artist, genre and duration as separate pieces (no joined "A · B" string),
 * so each wraps and reads on its own. Unknown parts are simply omitted.
 */
export function SongMeta({
  artist,
  genre,
  seconds,
  className = "meta",
}: {
  artist: string;
  genre?: string | null;
  seconds?: number | null;
  className?: string;
}) {
  const duration = formatDuration(seconds);
  return (
    <p className={className}>
      <span className="meta__artist">{artist}</span>
      <GenreTag genre={genre} />
      {duration && (
        <span className="meta__time">
          <span className="sr-only">Duración: </span>
          {duration}
        </span>
      )}
    </p>
  );
}

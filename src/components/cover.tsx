import { type CoverMotif, coverFor } from "../lib/cover";

type Palette = ReturnType<typeof coverFor>["palette"];

function Motif({ motif, p }: { motif: CoverMotif; p: Palette }) {
  switch (motif) {
    case "arch":
      return (
        <>
          <path d="M10 44V22a14 14 0 0 1 28 0v22z" fill={p.ink} />
          <path d="M17 44V24a7 7 0 0 1 14 0v20z" fill={p.ground} />
          <path d="M22 44 24 28l2 16z" fill={p.detail} />
        </>
      );
    case "orbit":
      return (
        <>
          <circle
            cx="24"
            cy="24"
            r="16"
            fill="none"
            stroke={p.ink}
            strokeWidth="2.5"
          />
          <circle
            cx="24"
            cy="24"
            r="9"
            fill="none"
            stroke={p.ink}
            strokeWidth="2.5"
          />
          <circle cx="24" cy="24" r="3.5" fill={p.detail} />
          <circle cx="37" cy="15" r="2.5" fill={p.detail} />
        </>
      );
    case "peaks":
      return (
        <>
          <path d="M4 42 24 12l20 30z" fill={p.ink} />
          <path d="M12 42 24 24l12 18z" fill={p.ground} />
          <path d="M18 42 24 33l6 9z" fill={p.detail} />
        </>
      );
    case "leaves":
      return (
        <>
          <rect x="7" y="8" width="34" height="32" rx="2" fill={p.ink} />
          <path d="M10 37V11c9 3 12 13 12 26z" fill={p.ground} />
          <path d="M38 37V11c-9 3-12 13-12 26z" fill={p.ground} />
          <path
            d="M14 33 18 16M34 33l-4-17"
            stroke={p.detail}
            strokeWidth="1.5"
          />
        </>
      );
    default:
      return (
        <>
          <rect x="0" y="10" width="48" height="6" fill={p.ink} />
          <rect x="0" y="22" width="48" height="6" fill={p.ink} />
          <rect x="0" y="34" width="48" height="6" fill={p.ink} />
          <circle cx="32" cy="25" r="9" fill={p.detail} />
        </>
      );
  }
}

/** Abstract, decorative cover generated from the song title. */
export function Cover({
  title,
  size = 48,
  className = "cover",
}: {
  title: string;
  size?: number;
  className?: string;
}) {
  const { palette, motif, mirrored } = coverFor(title);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="48" height="48" fill={palette.ground} />
      <g transform={mirrored ? "matrix(-1 0 0 1 48 0)" : undefined}>
        <Motif motif={motif} p={palette} />
      </g>
    </svg>
  );
}

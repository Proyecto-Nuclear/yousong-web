import { useId } from "react";

/**
 * Papel picado bunting along the top edge of the stage: the one decorative
 * flourish of the panel ("verbena" is a street party under flags). Static,
 * decorative and hidden from assistive tech.
 */
export function Bunting() {
  // useId may contain characters that break url(#…) references.
  const id = `bunting-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const colors = [
    "var(--accent)",
    "var(--live)",
    "var(--lilac)",
    "var(--text)",
  ];
  return (
    <svg className="bunting" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={id} width="112" height="14" patternUnits="userSpaceOnUse">
          {colors.map((color, index) => (
            <path
              key={color}
              d={`M${index * 28 + 3} 1h22l-11 12z`}
              style={{ fill: color }}
              opacity={index === 3 ? 0.55 : 0.9}
            />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="14" fill={`url(#${id})`} />
    </svg>
  );
}

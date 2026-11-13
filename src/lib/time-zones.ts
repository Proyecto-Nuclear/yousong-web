// Friendly time-zone choices for owners. Values stay the identifiers the
// backend validates; labels are what a bar owner recognizes.
export const TIME_ZONES: readonly { value: string; label: string }[] = [
  { value: "America/Bogota", label: "Colombia (Bogotá)" },
  { value: "America/Mexico_City", label: "México (Ciudad de México)" },
  { value: "America/Lima", label: "Perú (Lima)" },
  { value: "America/Guayaquil", label: "Ecuador (Guayaquil)" },
  { value: "America/Caracas", label: "Venezuela (Caracas)" },
  { value: "America/Panama", label: "Panamá" },
  { value: "America/Costa_Rica", label: "Costa Rica" },
  { value: "America/Guatemala", label: "Guatemala" },
  { value: "America/El_Salvador", label: "El Salvador" },
  { value: "America/Tegucigalpa", label: "Honduras" },
  { value: "America/Managua", label: "Nicaragua" },
  { value: "America/Santo_Domingo", label: "República Dominicana" },
  { value: "America/Puerto_Rico", label: "Puerto Rico" },
  { value: "America/Havana", label: "Cuba" },
  { value: "America/La_Paz", label: "Bolivia (La Paz)" },
  { value: "America/Santiago", label: "Chile (Santiago)" },
  {
    value: "America/Argentina/Buenos_Aires",
    label: "Argentina (Buenos Aires)",
  },
  { value: "America/Montevideo", label: "Uruguay (Montevideo)" },
  { value: "America/Asuncion", label: "Paraguay (Asunción)" },
  { value: "America/Sao_Paulo", label: "Brasil (São Paulo)" },
  { value: "America/New_York", label: "Estados Unidos (Nueva York)" },
  { value: "America/Los_Angeles", label: "Estados Unidos (Los Ángeles)" },
  { value: "Europe/Madrid", label: "España (Madrid)" },
];

/** Select value that reveals a free IANA input for zones outside the list. */
export const OTHER_TIME_ZONE = "__other__";

/** Curated choices followed by the "Otra zona (IANA)" escape hatch. */
export function timeZoneOptions() {
  return [...TIME_ZONES, { value: OTHER_TIME_ZONE, label: "Otra zona (IANA)" }];
}

/** Splits a saved zone into the select value and the free-text value. */
export function timeZoneChoice(current: string | undefined) {
  const zone = current ?? TIME_ZONES[0].value;
  return TIME_ZONES.some((item) => item.value === zone)
    ? { choice: zone, custom: "" }
    : { choice: OTHER_TIME_ZONE, custom: zone };
}

let supported: Set<string> | null = null;
/** True for identifiers the runtime knows (Intl.supportedValuesOf) and UTC. */
export function isValidTimeZone(value: string) {
  if (!value || value !== value.trim()) return false;
  if (value === "UTC") return true;
  if (typeof Intl.supportedValuesOf === "function") {
    supported ??= new Set(Intl.supportedValuesOf("timeZone"));
    return supported.has(value);
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value.includes("/");
  } catch {
    return false;
  }
}

export function timeZoneLabel(value: string) {
  return TIME_ZONES.find((zone) => zone.value === value)?.label ?? value;
}

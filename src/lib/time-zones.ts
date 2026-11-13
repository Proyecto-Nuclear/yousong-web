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

/** Known choices plus the saved value when it is not in the curated list. */
export function timeZoneOptions(current?: string) {
  if (!current || TIME_ZONES.some((zone) => zone.value === current))
    return TIME_ZONES;
  return [...TIME_ZONES, { value: current, label: current }];
}

export function timeZoneLabel(value: string) {
  return TIME_ZONES.find((zone) => zone.value === value)?.label ?? value;
}

export const OWNER_VIEWS = {
  PANEL: "Panel operativo",
  SESSION: "Sesión y QR",
  QUEUE: "Cola musical",
  SETUP: "Configuración y listas",
} as const;

/** Short labels for the phone tab bar, keyed by the full view name. */
export const OWNER_VIEW_SHORT: Record<string, string> = {
  [OWNER_VIEWS.PANEL]: "Panel",
  [OWNER_VIEWS.SESSION]: "Sesión",
  [OWNER_VIEWS.QUEUE]: "Cola",
  [OWNER_VIEWS.SETUP]: "Ajustes",
};

/** One-line subtitle under each page heading. */
export const OWNER_VIEW_SUBTITLE: Record<string, string> = {
  [OWNER_VIEWS.PANEL]: "Lo que suena y lo que viene, en vivo.",
  [OWNER_VIEWS.SESSION]:
    "Abre la noche, comparte el QR y controla la participación.",
  [OWNER_VIEWS.QUEUE]: "Las solicitudes de tu público, ordenadas por votos.",
  [OWNER_VIEWS.SETUP]:
    "La lista que suena cuando nadie pide y los datos del local.",
};

// Owner-facing messages. ownerError returns one of these (or passes one
// through unchanged), so mapping twice is harmless.
const MESSAGES = {
  permissions: "No tienes permisos para esta acción.",
  signIn: "Tu acceso caducó. Vuelve a entrar con tu cuenta para continuar.",
  catalogMissing:
    "La búsqueda de canciones no está disponible. Contacta con soporte.",
  catalogBusy:
    "No pudimos buscar canciones ahora. Intenta de nuevo en unos minutos.",
  songUnavailable:
    "Esa canción no está disponible en el catálogo. Prueba con otra.",
  budget:
    "Se agotaron las búsquedas de hoy para tu local. Vuelve a intentarlo mañana.",
  queueEmpty: "No hay canciones para sonar. Añade canciones a tu lista.",
  playing:
    "Ya hay una canción sonando. Termínala antes de pasar a la siguiente.",
  notPlaying: "No hay una canción sonando. Revisa la cola.",
  noList:
    "Guarda una lista en Configuración y listas antes de abrir la sesión.",
  slugTaken: "Ese enlace del QR ya lo usa otro local. Prueba con otro.",
  timeZone: "Elige una zona horaria de la lista.",
  sessionInProgress: "Finaliza la sesión antes de desactivar el local.",
  sessionOpen: "Ya hay una sesión abierta. Actualiza el estado.",
  sessionClosed: "La sesión ya terminó. Actualiza el estado.",
  paused: "La sesión está en pausa. Reanúdala para seguir.",
  servicePaused:
    "El servicio del local está en pausa. Reanúdalo en Sesión y QR.",
  maintenance: "El local está en mantenimiento. Termínalo en Sesión y QR.",
  inactive: "El local está desactivado. Actívalo en Configuración y listas.",
  rate: "Demasiadas acciones seguidas. Espera un momento y vuelve a intentarlo.",
  offline:
    "No hay conexión con YouSong. Revisa la red y actualiza antes de repetir la acción.",
  data: "Revisa los datos antes de continuar.",
  searchLength: "Escribe al menos 2 letras para buscar (máximo 100).",
  listUncertain:
    "No pudimos confirmar el guardado. Revisa la lista antes de volver a guardar.",
  listLoad: "No pudimos cargar la lista. Intenta de nuevo.",
  queueChange:
    "No pudimos confirmar el cambio. Revisa la cola antes de intentarlo otra vez.",
  generic:
    "No pudimos confirmar la acción. Actualiza el estado antes de intentarlo otra vez.",
} as const;
const KNOWN = new Set<string>(Object.values(MESSAGES));

// Presentation-only translation. API error codes and transport contracts stay
// authoritative; unexpected diagnostics never become owner-facing text.
export function ownerError(reason: unknown): string {
  const text =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "";
  if (KNOWN.has(text)) return text;
  const rules: [RegExp, string][] = [
    [/permisos/i, MESSAGES.permissions],
    [/credencial|caducad|autentic/i, MESSAGES.signIn],
    [/catálogo.*configurado/i, MESSAGES.catalogMissing],
    [/presupuesto de búsquedas/i, MESSAGES.budget],
    [/una canción no está disponible/i, MESSAGES.songUnavailable],
    [/catálogo|cuota/i, MESSAGES.catalogBusy],
    [/cola.*vacía|no tienen canciones disponibles/i, MESSAGES.queueEmpty],
    [/curso/i, MESSAGES.playing],
    [/reproducción activa/i, MESSAGES.notPlaying],
    [/lista predeterminada/i, MESSAGES.noList],
    [/identificador QR ya está en uso/i, MESSAGES.slugTaken],
    [/zona horaria/i, MESSAGES.timeZone],
    [/antes de desactivar/i, MESSAGES.sessionInProgress],
    [/ya existe una sesión/i, MESSAGES.sessionOpen],
    [/ya está cerrada/i, MESSAGES.sessionClosed],
    [/servicio.*pausado/i, MESSAGES.servicePaused],
    [
      /sesión está pausada|no está pausada|solo se puede pausar/i,
      MESSAGES.paused,
    ],
    [/mantenimiento/i, MESSAGES.maintenance],
    [/inactivo/i, MESSAGES.inactive],
    [/demasiadas/i, MESSAGES.rate],
    [/conectar con la API/i, MESSAGES.offline],
    [/confirmar el cambio/i, MESSAGES.queueChange],
    [/búsqueda de 2 a 100/i, MESSAGES.searchLength],
    [/datos|caracteres|tamaño|formato/i, MESSAGES.data],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? MESSAGES.generic;
}

/** Session (music night) state as shown in chips; never the account login. */
export function sessionNotice(state: string): string {
  if (state === "ABIERTA") return "Sesión activa";
  if (state === "PAUSADA") return "Sesión en pausa";
  if (state === "CERRANDO") return "Finalizando sesión";
  if (state === "CERRADA") return "Sesión finalizada";
  return "Estado por confirmar";
}

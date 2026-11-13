export const OWNER_VIEWS = {
  PANEL: "Panel operativo",
  SESSION: "Sesión y QR",
  QUEUE: "Cola musical",
  SETUP: "Configuración y listas",
} as const;

// Presentation-only translation. API error codes and transport contracts stay
// authoritative; unexpected diagnostics never become owner-facing text.
export function ownerError(reason: unknown): string {
  const text =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "";
  if (/permisos/i.test(text)) return "No tienes permisos para esta operación.";
  if (/sesión|sesion/i.test(text) && /inicia|caduc|autentic/i.test(text))
    return "Vuelve a iniciar sesión para continuar.";
  if (/catálogo.*configurado/i.test(text))
    return "El catálogo no está disponible. Contacta con soporte.";
  if (/catálogo|cuota/i.test(text))
    return "No pudimos consultar el catálogo. Intenta de nuevo en unos minutos.";
  if (/cola.*vacía/i.test(text))
    return "No hay canciones disponibles. Añade canciones a tu lista.";
  if (/curso/i.test(text))
    return "Ya hay una canción en reproducción. Revisa la cola.";
  if (/reproducción activa/i.test(text))
    return "No hay una canción en reproducción. Revisa la cola.";
  if (/datos|caracteres|tamaño/i.test(text))
    return "Revisa los datos antes de continuar.";
  return "No pudimos confirmar la operación. Revisa el estado antes de intentarlo otra vez.";
}

export function sessionNotice(state: string): string {
  if (state === "ABIERTA") return "Sesión abierta";
  if (state === "PAUSADA") return "Sesión pausada";
  if (state === "CERRANDO") return "Finalizando sesión";
  if (state === "CERRADA") return "Sesión finalizada";
  return "Estado sin confirmar";
}

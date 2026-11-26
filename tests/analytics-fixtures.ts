// Demonstration data of documentation/YouSong_Analiticas.pdf, shaped like
// the analytics API contract. Shared by the dashboard tests.
import type {
  Analitica,
  GenreCell,
  Jornada,
} from "../src/lib/analytics-contracts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DATES = [
  "2025-10-25",
  "2025-10-31",
  "2025-11-01",
  "2025-11-07",
  "2025-11-08",
  "2025-11-14",
  "2025-11-15",
  "2025-11-21",
];
const INGRESARON = [28, 36, 41, 30, 44, 33, 39, 34];
const ACTIVAS = [21, 29, 33, 22, 35, 25, 31, 27];
const HOURS = [20, 21, 22, 23, 0, 1];
const GRID: [string, (number | null)[]][] = [
  ["Rock en español", [40, 28, 16, 10, 6, null]],
  ["Pop latino", [30, 24, 18, 14, 10, 8]],
  ["Salsa", [20, 26, 30, 26, 20, 18]],
  ["Vallenato", [10, 14, 18, 20, 22, 24]],
  ["Reggaetón", [null, 8, 18, 30, 42, 50]],
];
export function genreCells(shift = 0): GenreCell[] {
  return GRID.flatMap(([genero, values]) =>
    values.map((value, index) => ({
      genero,
      hora: HOURS[index],
      porcentaje: value === null ? null : Math.max(0, value + shift),
      suprimida: value === null,
    })),
  );
}
const song = (
  videoId: string,
  titulo: string,
  artista: string,
  genero: string,
) => ({
  videoId,
  titulo,
  artista,
  artistaVerificado: false,
  duracionSegundos: 210,
  miniaturaUrl: null,
  genero,
});

export const history: Analitica = {
  publicacion: {
    version: 12,
    publicadaAt: "2025-11-22T04:46:00Z",
    corteEventosAt: "2025-11-22T04:45:00Z",
  },
  jornadas: DATES.map((fechaOperativa, index) => ({
    sesionId: id(index + 1),
    fechaOperativa,
  })),
  participacion: DATES.map((_, index) => ({
    sesionId: id(index + 1),
    ingresaron: INGRESARON[index],
    activas: ACTIVAS[index],
  })),
  canales: { WEB: 197, ANDROID: 88 },
  ranking: [
    [song("aaaaaaaaaa1", "Vivir mi vida", "Marc Anthony", "Salsa"), 61, 8],
    [song("aaaaaaaaaa2", "Tusa", "KAROL G", "Reggaetón"), 52, 3],
    [
      song("aaaaaaaaaa3", "La bicicleta", "Carlos Vives, Shakira", "Vallenato"),
      48,
      7,
    ],
    [song("aaaaaaaaaa4", "La camisa negra", "Juanes", "Pop latino"), 44, 9],
    [song("aaaaaaaaaa5", "Felices los 4", "Maluma", "Reggaetón"), 40, 6],
    [song("aaaaaaaaaa6", "Rayando el sol", "Maná", "Rock en español"), 33, 5],
    [song("aaaaaaaaaa7", "A Dios le pido", "Juanes", "Pop latino"), 29, 4],
    [
      song("aaaaaaaaaa8", "Ella es mi fiesta", "Carlos Vives", "Vallenato"),
      26,
      2,
    ],
  ].map(([cancion, votos, completadas]) => ({
    cancion: cancion as ReturnType<typeof song>,
    votos: votos as number,
    completadas: completadas as number,
  })),
  generosPorHora: DATES.map((fechaOperativa, index) => ({
    sesionId: id(index + 1),
    fechaOperativa,
    diaSemana: new Date(`${fechaOperativa}T12:00:00Z`).getUTCDay() || 7,
    celdas: genreCells(index - 7),
  })),
};

/** The night of 21 nov, closed (the PDF figures). */
export const closedNight: Jornada = {
  sesion: { id: id(8), fechaOperativa: "2025-11-21", estado: "CERRADA" },
  enVivo: false,
  corteAt: "2025-11-22T06:10:00Z",
  participacion: { ingresaron: 34, activas: 27 },
  canales: { WEB: 24, ANDROID: 10 },
  porHora: [
    { hora: 20, solicitudes: 3, votos: 11 },
    { hora: 21, solicitudes: 7, votos: 33 },
    { hora: 22, solicitudes: 11, votos: 53 },
    { hora: 23, solicitudes: 11, votos: 55 },
    { hora: 0, solicitudes: 7, votos: 28 },
    { hora: 1, solicitudes: 2, votos: 6 },
  ],
  embudo: { creadas: 41, iniciadas: 29, completadas: 26 },
  estados: {
    PENDIENTE: 0,
    RESERVADA: 0,
    REPRODUCIENDO: 0,
    ATENDIDA: 26,
    SALTADA: 3,
    FALLIDA: 2,
    BLOQUEADA: 1,
    NO_ATENDIDA_CIERRE: 9,
  },
  espera: {
    medianaS: 540,
    p95S: 1440,
    iniciadas: 29,
    tramos: [
      { desdeMin: 0, hastaMin: 5, total: 8 },
      { desdeMin: 5, hastaMin: 10, total: 9 },
      { desdeMin: 10, hastaMin: 15, total: 5 },
      { desdeMin: 15, hastaMin: 20, total: 3 },
      { desdeMin: 20, hastaMin: 25, total: 3 },
      { desdeMin: 25, hastaMin: null, total: 1 },
    ],
    pendientes: 9,
    antiguedadMedianaPendientesS: 1260,
  },
  reproducciones: [
    {
      origen: "SOLICITUD",
      completadas: 26,
      saltadas: 3,
      fallidas: 4,
      interrumpidas: 0,
      enCurso: 0,
    },
    {
      origen: "DEFECTO",
      completadas: 5,
      saltadas: 0,
      fallidas: 0,
      interrumpidas: 1,
      enCurso: 0,
    },
  ],
  generosPorHora: genreCells(),
};

/** A night in progress (28 nov): requests still waiting and one playing. */
export const liveNight: Jornada = {
  ...closedNight,
  sesion: { id: id(9), fechaOperativa: "2025-11-28", estado: "ABIERTA" },
  enVivo: true,
  corteAt: "2025-11-29T03:12:40Z",
  porHora: closedNight.porHora.slice(0, 3),
  embudo: { creadas: 21, iniciadas: 12, completadas: 10 },
  estados: {
    PENDIENTE: 6,
    RESERVADA: 2,
    REPRODUCIENDO: 1,
    ATENDIDA: 10,
    SALTADA: 1,
    FALLIDA: 1,
    BLOQUEADA: 0,
    NO_ATENDIDA_CIERRE: 0,
  },
  espera: {
    ...closedNight.espera,
    medianaS: 420,
    p95S: 1080,
    iniciadas: 12,
    pendientes: 8,
    antiguedadMedianaPendientesS: 600,
  },
  reproducciones: [
    {
      origen: "SOLICITUD",
      completadas: 10,
      saltadas: 1,
      fallidas: 2,
      interrumpidas: 0,
      enCurso: 1,
    },
    {
      origen: "DEFECTO",
      completadas: 2,
      saltadas: 0,
      fallidas: 0,
      interrumpidas: 0,
      enCurso: 0,
    },
  ],
  generosPorHora: genreCells(3).filter((cell) =>
    [20, 21, 22].includes(cell.hora),
  ),
};

/** No night yet: every count is zero and both origins are present. */
export const noNight: Jornada = {
  sesion: null,
  enVivo: false,
  corteAt: "2025-11-29T03:12:40Z",
  participacion: { ingresaron: 0, activas: 0 },
  canales: { WEB: 0, ANDROID: 0 },
  porHora: [],
  embudo: { creadas: 0, iniciadas: 0, completadas: 0 },
  estados: {
    PENDIENTE: 0,
    RESERVADA: 0,
    REPRODUCIENDO: 0,
    ATENDIDA: 0,
    SALTADA: 0,
    FALLIDA: 0,
    BLOQUEADA: 0,
    NO_ATENDIDA_CIERRE: 0,
  },
  espera: {
    medianaS: null,
    p95S: null,
    iniciadas: 0,
    tramos: [],
    pendientes: 0,
    antiguedadMedianaPendientesS: null,
  },
  reproducciones: [
    {
      origen: "SOLICITUD",
      completadas: 0,
      saltadas: 0,
      fallidas: 0,
      interrumpidas: 0,
      enCurso: 0,
    },
    {
      origen: "DEFECTO",
      completadas: 0,
      saltadas: 0,
      fallidas: 0,
      interrumpidas: 0,
      enCurso: 0,
    },
  ],
  generosPorHora: [],
};

export const unpublished: Analitica = {
  publicacion: null,
  jornadas: [],
  participacion: [],
  canales: { WEB: 0, ANDROID: 0 },
  ranking: [],
  generosPorHora: [],
};
export const sessionId = id;

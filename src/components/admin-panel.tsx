"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { login, logout } from "@/app/actions";
import type { Establishment, Qr, SearchPage, Session } from "@/lib/admin-api";
import { DemoApi } from "@/lib/demo-api";
import { EstablishmentForm } from "./demo/establishment-form";
import { ListConfiguration } from "./demo/list-configuration";
import { QueuePanel } from "./demo/queue-panel";

const VIEW = {
  PANEL: "Panel operativo",
  SESSION: "Sesión y QR",
  QUEUE: "Cola musical",
  CATALOG: "Catálogo",
  SETUP: "Configuración y listas",
} as const;
type View = (typeof VIEW)[keyof typeof VIEW];
const message = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";

function QrCard({ qr }: { qr: Qr }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(
      new Blob([qr.svg], { type: "image/svg+xml" }),
    );
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [qr]);
  return (
    <>
      {source && (
        <>
          {/* SVG is isolated in image context, never inserted as HTML. */}
          {/* biome-ignore lint/performance/noImgElement: API SVG blob must not use the image optimizer. */}
          <img
            className="qr"
            src={source}
            alt="Código QR de acceso al establecimiento"
            width={220}
            height={220}
            referrerPolicy="no-referrer"
          />
          <a className="button" href={source} download="yousong-acceso.svg">
            Descargar QR (SVG)
          </a>
        </>
      )}
      <p className="break">{qr.url}</p>
      <p>
        El QR identifica al establecimiento. La participación requiere una
        sesión en operación.
      </p>
    </>
  );
}

export function AdminPanel(props: { authenticated: boolean; roles: string[] }) {
  return (
    <AdminPanelContent
      key={`${props.authenticated}:${props.roles.join(",")}`}
      {...props}
    />
  );
}

function AdminPanelContent({
  authenticated,
  roles,
}: {
  authenticated: boolean;
  roles: string[];
}) {
  const isAdmin = roles.includes("ADMINISTRADOR");
  const [api, setApi] = useState<DemoApi | null>(null);
  const [items, setItems] = useState<Establishment[]>([]);
  const [selected, setSelected] = useState<Establishment | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [qr, setQr] = useState<Qr | null>(null);
  const [qrError, setQrError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>(VIEW.PANEL);
  const [results, setResults] = useState<SearchPage | null>(null);
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  function saved(establishment: Establishment) {
    setItems((previous) =>
      previous.some((item) => item.id === establishment.id)
        ? previous.map((item) =>
            item.id === establishment.id ? establishment : item,
          )
        : [...previous, establishment],
    );
    if (api) void load(api, establishment);
  }
  async function load(client: DemoApi, establishment: Establishment) {
    pending.current = true;
    const version = ++generation.current;
    setSelected(establishment);
    setSession(null);
    setQr(null);
    setLoaded(false);
    setError("");
    setQrError("");
    setNotice("");
    setBusy(true);
    await Promise.all([
      client
        .currentSession(establishment.id)
        .then((value) => {
          if (version === generation.current) {
            setSession(value);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (version === generation.current) setError(message(e));
        }),
      (isAdmin ? client.qr(establishment.id) : Promise.resolve(null))
        .then((value) => {
          if (version === generation.current) setQr(value);
        })
        .catch((e) => {
          if (version === generation.current) setQrError(message(e));
        }),
    ]);
    if (version === generation.current) {
      setBusy(false);
      pending.current = false;
    }
  }
  async function connect() {
    if (pending.current) return;
    pending.current = true;
    setError("");
    setBusy(true);
    const version = ++generation.current;
    try {
      const client = new DemoApi();
      const establishments = await client.establishments();
      if (version !== generation.current) return;
      setApi(client);
      setItems(establishments);
      if (establishments[0]) await load(client, establishments[0]);
      else {
        setBusy(false);
        pending.current = false;
      }
    } catch (e) {
      if (version === generation.current) {
        setError(message(e));
        setBusy(false);
        pending.current = false;
      }
    }
  }
  async function mutate() {
    if (!api || !selected || !loaded || pending.current) return;
    if (
      session &&
      !window.confirm(
        "¿Finalizar la sesión? Se revocará el acceso de participantes y se finalizarán las solicitudes pendientes.",
      )
    )
      return;
    const version = generation.current;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (session) {
        const result = await api.closeSession(session.id);
        if (version !== generation.current) return;
        setSession(null);
        setNotice(
          `Sesión finalizada. Solicitudes sin atender al cierre: ${result.pendientesAlCierre}.`,
        );
      } else {
        const result = await api.openSession(selected.id);
        if (version !== generation.current) return;
        setSession(result);
        setNotice("Sesión abierta en el backend.");
      }
    } catch (e) {
      if (version === generation.current) {
        setError(message(e));
        setLoaded(false);
      }
    } finally {
      if (version === generation.current) {
        setBusy(false);
        pending.current = false;
      }
    }
  }
  async function search(event?: FormEvent, page?: string) {
    event?.preventDefault();
    if (!api || pending.current) return;
    pending.current = true;
    const version = generation.current;
    const text = page ? searchedQuery : query;
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const value = await api.search(text, page);
      if (version === generation.current) {
        setResults(value);
        setSearchedQuery(text);
      }
    } catch (e) {
      if (version === generation.current) setError(message(e));
    } finally {
      if (version === generation.current) {
        setBusy(false);
        pending.current = false;
      }
    }
  }

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Saltar al contenido
      </a>
      <header className="topbar">
        <a className="brand" href="/" aria-label="YouSong inicio">
          Y<span>YouSong</span>
        </a>
        <span className="top-label">Administración · Música para tu local</span>
        <span className="badge">{api ? "API conectada" : "Sin conexión"}</span>
        {authenticated && (
          <form action={logout}>
            <button type="submit">Cerrar sesión</button>
          </form>
        )}
      </header>
      <aside className="sidebar">
        <p className="eyebrow">Operación del local</p>
        <nav aria-label="Administración">
          {Object.values(VIEW).map((name) => (
            <button
              key={name}
              type="button"
              aria-current={view === name ? "page" : undefined}
              onClick={() => setView(name)}
            >
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          Una sala.
          <br />
          Muchas canciones.<p>Datos reales, sin simulación.</p>
        </div>
      </aside>
      <main id="main" tabIndex={-1}>
        <div className="heading">
          <div>
            <p className="eyebrow">YouSong / Operación</p>
            <h1>{view}</h1>
            <p>Gestiona la sesión de tu establecimiento.</p>
          </div>
          <span className="badge">
            {busy ? "Cargando…" : (selected?.nombre ?? "Conexión de personal")}
          </span>
        </div>
        {error && (
          <p id="operation-error" className="alert" role="alert">
            {error}
          </p>
        )}
        <output className="status" aria-live="polite">
          {busy ? (
            <p>Cargando datos de la API…</p>
          ) : (
            notice && <p className="notice">{notice}</p>
          )}
        </output>
        {!api ? (
          <section className="card connection">
            <p className="eyebrow">Acceso de personal</p>
            <h2>
              {authenticated ? "Sesión de personal iniciada" : "Iniciar sesión"}
            </h2>
            <p>
              Accede de forma segura con FusionAuth. Las credenciales de la API
              se gestionan únicamente en el servidor.
            </p>
            {authenticated ? (
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => void connect()}
              >
                {busy ? "Conectando…" : "Cargar establecimiento"}
              </button>
            ) : (
              <form action={login}>
                <button className="primary" type="submit">
                  Iniciar sesión con FusionAuth
                </button>
              </form>
            )}
          </section>
        ) : (
          <>
            <section className="selector card">
              <label htmlFor="establishment">Establecimiento</label>
              <select
                id="establishment"
                value={selected?.id ?? ""}
                disabled={busy || items.length === 0}
                onChange={(event) => {
                  const item = items.find((e) => e.id === event.target.value);
                  if (item) void load(api, item);
                }}
              >
                {!items.length && (
                  <option value="">Sin establecimientos</option>
                )}
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                    {!item.activo ? " · Inactivo" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !selected}
                onClick={() => selected && void load(api, selected)}
              >
                Actualizar estado
              </button>
            </section>
            {!items.length && (
              <section className="card">
                <h2>Sin establecimientos</h2>
                <p>
                  La API no devolvió establecimientos.{" "}
                  {isAdmin
                    ? "Puedes crear el primero a continuación."
                    : "Solicita su configuración a un administrador."}
                </p>
              </section>
            )}
            {isAdmin && (!items.length || view === VIEW.SETUP) && (
              <EstablishmentForm
                key={`create:${selected?.id ?? "empty"}`}
                api={api}
                onSaved={saved}
              />
            )}
            {selected && (
              <>
                {view === VIEW.SETUP && (
                  <>
                    {isAdmin && (
                      <EstablishmentForm
                        key={selected.id}
                        api={api}
                        current={selected}
                        onSaved={saved}
                      />
                    )}
                    <ListConfiguration
                      key={`list:${selected.id}`}
                      api={api}
                      establishmentId={selected.id}
                      isAdmin={isAdmin}
                    />
                  </>
                )}
                {(view === VIEW.PANEL || view === VIEW.SESSION) && (
                  <div className="session-grid">
                    <section className="card">
                      <p className="eyebrow">Acceso para participantes</p>
                      <h2>QR del establecimiento</h2>
                      {qr ? (
                        <QrCard qr={qr} />
                      ) : (
                        <p>
                          {!isAdmin
                            ? "El QR requiere el rol ADMINISTRADOR."
                            : qrError ||
                              (busy ? "Cargando QR…" : "QR no disponible.")}
                        </p>
                      )}
                      <p className="muted">
                        Consultar y descargar el QR requiere ADMINISTRADOR.
                      </p>
                    </section>
                    <section className="card">
                      <p className="eyebrow">Control del local</p>
                      <h2>Sesión actual</h2>
                      {!loaded ? (
                        <p>Estado sin confirmar. Actualiza antes de operar.</p>
                      ) : session ? (
                        <>
                          <span className="badge">{session.estado}</span>
                          <dl>
                            <dt>Fecha operativa</dt>
                            <dd>{session.fechaOperativa}</dd>
                            <dt>Apertura</dt>
                            <dd>
                              {new Date(session.abiertaAt).toLocaleString(
                                "es",
                                { timeZone: selected.zonaHoraria },
                              )}
                            </dd>
                            <dt>Zona horaria</dt>
                            <dd>{selected.zonaHoraria}</dd>
                          </dl>
                        </>
                      ) : (
                        <p>No hay una sesión en operación.</p>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          className={session ? "danger" : "primary"}
                          disabled={
                            busy || !loaded || (!selected.activo && !session)
                          }
                          onClick={() => void mutate()}
                        >
                          {session ? "Finalizar sesión" : "Abrir sesión"}
                        </button>
                      )}
                      <p>
                        Operación exclusiva de ADMINISTRADOR. Abrir requiere un
                        local activo y una lista predeterminada configurada.
                      </p>
                      <hr />
                      <p>
                        Pausar solicitudes, mantenimiento y programación
                        automática: no disponibles en la API actual.
                      </p>
                    </section>
                  </div>
                )}
                {(view === VIEW.PANEL || view === VIEW.QUEUE) && (
                  <QueuePanel
                    key={`queue:${selected.id}:${session?.id ?? "none"}`}
                    api={api}
                    establishment={selected}
                    session={loaded ? session : null}
                  />
                )}
                {view === VIEW.CATALOG && (
                  <section className="card">
                    <p className="eyebrow">Catálogo conectado</p>
                    <h2>Buscar canciones</h2>
                    <form className="search" onSubmit={search}>
                      <label htmlFor="query">
                        Título o artista (2–100 caracteres)
                      </label>
                      <input
                        id="query"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        minLength={2}
                        maxLength={100}
                        required
                        disabled={busy}
                      />
                      <button type="submit" disabled={busy}>
                        Buscar
                      </button>
                    </form>
                    <p>
                      Consulta del catálogo; añadir a la cola no está
                      disponible.
                    </p>
                    {results && (
                      <>
                        <output className="status">
                          {results.resultados.length
                            ? `${results.resultados.length} resultados en esta página`
                            : "No se encontraron canciones."}
                        </output>
                        <ul className="songs">
                          {results.resultados.map((song) => (
                            <li key={song.videoId}>
                              <span className="song-icon" aria-hidden="true">
                                ♪
                              </span>
                              <div>
                                <h3>{song.titulo}</h3>
                                <p>
                                  {song.artista}
                                  {song.artistaVerificado
                                    ? " · Artista verificado"
                                    : ""}
                                </p>
                                <p>
                                  Canal: {song.canal} ·{" "}
                                  {song.duracionSegundos === null
                                    ? "Duración no disponible"
                                    : `${Math.floor(song.duracionSegundos / 60)}:${String(song.duracionSegundos % 60).padStart(2, "0")}`}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                        {results.siguientePagina && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void search(
                                undefined,
                                results.siguientePagina ?? undefined,
                              )
                            }
                          >
                            Siguiente página
                          </button>
                        )}
                      </>
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
        <footer>Acceso seguro de personal · Sin reproducción de audio</footer>
      </main>
    </div>
  );
}

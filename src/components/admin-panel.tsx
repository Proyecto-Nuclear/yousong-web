"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { login, logout } from "@/app/actions";
import type { Establishment, Qr, Session } from "@/lib/admin-api";
import { DemoApi } from "@/lib/demo-api";
import {
  ownerError,
  sessionNotice,
  OWNER_VIEWS as VIEW,
} from "@/lib/owner-copy";
import { EstablishmentForm } from "./demo/establishment-form";
import { ListConfiguration } from "./demo/list-configuration";
import { QueuePanel } from "./demo/queue-panel";

type View = (typeof VIEW)[keyof typeof VIEW];
const OWNER_CONTROL = {
  PAUSE: "pause",
  RESUME: "resume",
  SERVICE: "service",
  MAINTENANCE: "maintenance",
} as const;
type OwnerControl = (typeof OWNER_CONTROL)[keyof typeof OWNER_CONTROL];
const message = ownerError;

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
      <a
        className="button break"
        href={qr.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Abrir acceso móvil
      </a>
      <p className="muted">
        Escanea con la cámara del móvil. Abre la sesión para permitir la
        participación.
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
}: {
  authenticated: boolean;
  roles: string[];
}) {
  // Any authenticated account may operate its own establishment. Roles are
  // display hints only; backend JWT-sub ownership is the authorization.
  const ownerAccess = authenticated;
  const [api, setApi] = useState<DemoApi | null>(null);
  const [items, setItems] = useState<Establishment[]>([]);
  const [selected, setSelected] = useState<Establishment | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readiness, setReadiness] = useState("Disponibilidad sin consultar.");
  const [hasList, setHasList] = useState<boolean | null>(null);
  const [qr, setQr] = useState<Qr | null>(null);
  const [qrError, setQrError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>(VIEW.PANEL);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(
    () => () => {
      generation.current++;
      pending.current = false;
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
    setHasList(null);
    setReadiness("Disponibilidad sin confirmar.");
    setError("");
    setQrError("");
    setNotice("");
    setBusy(true);
    await Promise.all([
      client
        .currentList(establishment.id)
        .then((list) => {
          if (version === generation.current) setHasList(list !== null);
        })
        .catch((e) => {
          if (version === generation.current) setError(message(e));
        }),
      client
        .availability(establishment.qrSlug)
        .then((value) => {
          if (version === generation.current)
            setReadiness(
              value.puedeParticipar
                ? "Disponible para participar con QR"
                : "No disponible para participar ahora. Revisa la sesión y el horario del local.",
            );
        })
        .catch((e) => {
          if (version === generation.current) setReadiness(message(e));
        }),
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
      (ownerAccess ? client.qr(establishment.id) : Promise.resolve(null))
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
    setLoaded(false);
    try {
      const client = new DemoApi();
      const establishments = await client.establishments();
      if (version !== generation.current) return;
      setApi(client);
      setItems(establishments);
      if (establishments[0]) await load(client, establishments[0]);
      else {
        setSelected(null);
        setSession(null);
        setQr(null);
        setLoaded(false);
        setHasList(null);
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
  const connectOnEntry = useEffectEvent(() => {
    void connect();
  });
  useEffect(() => {
    if (authenticated) connectOnEntry();
  }, [authenticated]);

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
    setReadiness(
      "Disponibilidad sin confirmar. Actualiza el estado después de operar.",
    );
    setLoaded(false);
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
        setNotice("Sesión abierta");
      }
      setLoaded(true);
      await refreshAvailability(api, selected, version);
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
  async function refreshAvailability(
    client: DemoApi,
    establishment: Establishment,
    version: number,
  ) {
    try {
      const value = await client.availability(establishment.qrSlug);
      if (version === generation.current)
        setReadiness(
          value.puedeParticipar
            ? "Disponible para participar con QR"
            : "No disponible para participar ahora. Revisa la sesión y el horario del local.",
        );
    } catch {
      if (version === generation.current)
        setReadiness(
          "No pudimos consultar la disponibilidad. Reintenta la consulta de estado.",
        );
    }
  }
  async function control(action: OwnerControl) {
    if (!api || !selected || !loaded || pending.current) return;
    const version = generation.current;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setLoaded(false);
    try {
      if (action === "pause" || action === "resume") {
        const value =
          action === "pause"
            ? await api.pauseSession()
            : await api.resumeSession();
        if (version !== generation.current) return;
        setSession(value);
        setNotice(sessionNotice(value.estado));
      } else {
        const value =
          action === "service"
            ? await api.resumeService()
            : await api.endMaintenance();
        if (version !== generation.current) return;
        setSelected(value);
        setNotice("Servicio actualizado");
      }
      setLoaded(true);
      await refreshAvailability(api, selected, version);
    } catch (e) {
      if (version === generation.current) {
        setError(message(e));
        setLoaded(false);
        setReadiness("Resultado sin confirmar. Actualiza antes de repetir.");
      }
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
        <span className="badge">
          {session ? sessionNotice(session.estado) : "Sin sesión abierta"}
        </span>
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
      </aside>
      <main id="main" tabIndex={-1}>
        <div className="heading">
          <div>
            <h1>{view}</h1>
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
            <p>Cargando…</p>
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
              {authenticated
                ? "Preparando tu establecimiento."
                : "Accede para gestionar la música de tu local."}
            </p>
            {authenticated ? (
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => void connect()}
              >
                {busy ? "Conectando…" : "Reintentar conexión"}
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
            {(view === VIEW.PANEL || view === VIEW.SESSION) && (
              <section className="selector card">
                <p>
                  Mi establecimiento:{" "}
                  {selected?.nombre ?? "Sin establecimiento asociado"}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void connect()}
                >
                  Actualizar estado
                </button>
              </section>
            )}
            {!items.length && (
              <section className="card">
                <h2>Sin establecimientos</h2>
                <p>
                  Esta cuenta no tiene un establecimiento asociado. Puedes crear
                  el tuyo a continuación. Los establecimientos antiguos sin
                  propietario no se asignan automáticamente.
                </p>
              </section>
            )}
            {ownerAccess && !items.length && (
              <EstablishmentForm
                key={`create:${selected?.id ?? "empty"}`}
                api={api}
                onSaved={saved}
              />
            )}
            {selected && (
              <>
                <ListConfiguration
                  key={`list:${selected.id}`}
                  api={api}
                  establishmentId={selected.id}
                  canManage={ownerAccess}
                  active={view === VIEW.SETUP}
                  onAvailabilityChange={setHasList}
                />
                {view === VIEW.SETUP && ownerAccess && (
                  <details className="card">
                    <summary>Datos del establecimiento</summary>
                    <EstablishmentForm
                      key={selected.id}
                      api={api}
                      current={selected}
                      onSaved={saved}
                    />
                  </details>
                )}
                {(view === VIEW.PANEL || view === VIEW.SESSION) && (
                  <div className="session-grid">
                    <section className="card">
                      <h2>Acceso móvil</h2>
                      {qr ? (
                        <QrCard qr={qr} />
                      ) : (
                        <p>
                          {qrError ||
                            (busy ? "Cargando QR…" : "QR no disponible.")}
                        </p>
                      )}
                    </section>
                    <section className="card">
                      <h2>Sesión actual</h2>
                      {!loaded ? (
                        <p>Estado sin confirmar. Actualiza antes de operar.</p>
                      ) : session ? (
                        <>
                          <span className="badge">
                            {sessionNotice(session.estado)}
                          </span>
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
                      {ownerAccess && (
                        <button
                          type="button"
                          className={session ? "danger" : "primary"}
                          disabled={
                            busy ||
                            !loaded ||
                            (!session &&
                              (!selected.activo ||
                                selected.pausado ||
                                selected.enMantenimiento ||
                                !hasList))
                          }
                          onClick={() => void mutate()}
                        >
                          {session ? "Finalizar sesión" : "Abrir sesión"}
                        </button>
                      )}
                      {!session && hasList === false && (
                        <p>
                          Guarda una lista en Configuración y listas antes de
                          abrir.
                        </p>
                      )}
                      <output className="status" aria-live="polite">
                        {readiness}
                      </output>
                      {session?.estado === "ABIERTA" && (
                        <button
                          type="button"
                          disabled={busy || !loaded}
                          onClick={() => void control("pause")}
                        >
                          Pausar sesión
                        </button>
                      )}
                      {session?.estado === "PAUSADA" && (
                        <button
                          type="button"
                          disabled={busy || !loaded}
                          onClick={() => void control("resume")}
                        >
                          Reanudar sesión
                        </button>
                      )}
                      {selected.pausado && (
                        <button
                          type="button"
                          disabled={busy || !loaded}
                          onClick={() => void control("service")}
                        >
                          Reanudar servicio del establecimiento
                        </button>
                      )}
                      {selected.enMantenimiento && (
                        <button
                          type="button"
                          disabled={busy || !loaded || !!session}
                          onClick={() => void control("maintenance")}
                        >
                          Finalizar mantenimiento
                        </button>
                      )}
                      <details>
                        <summary>Requisitos de apertura</summary>
                        <p>
                          El local debe estar activo, sin pausa ni mantenimiento
                          y tener una lista guardada. El horario del local
                          también determina cuándo se puede participar.
                        </p>
                      </details>
                    </section>
                  </div>
                )}
                {(view === VIEW.PANEL || view === VIEW.QUEUE) && (
                  <QueuePanel
                    key={`queue:${selected.id}:${session?.id ?? "none"}:${session?.estado}:${selected.pausado}:${selected.enMantenimiento}:${loaded}`}
                    api={api}
                    establishment={selected}
                    session={loaded ? session : null}
                    showPlaybackControls={view === VIEW.PANEL}
                  />
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

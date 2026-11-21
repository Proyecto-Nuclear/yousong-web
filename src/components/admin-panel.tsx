"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { login, logout } from "@/app/actions";
import type { Establishment, Qr, Session } from "@/lib/admin-api";
import { DemoApi } from "@/lib/demo-api";
import { nightLabel, plural } from "@/lib/format";
import {
  OWNER_VIEW_SUBTITLE,
  ownerError,
  sessionNotice,
  OWNER_VIEWS as VIEW,
} from "@/lib/owner-copy";
import { timeZoneLabel } from "@/lib/time-zones";
import {
  ArrowUpIcon,
  BrandMark,
  CheckIcon,
  CloseIcon,
  ExternalIcon,
  HeadphonesIcon,
  LogoutIcon,
  PauseIcon,
  PlayIcon,
  QrIcon,
  RefreshIcon,
  StopIcon,
  WrenchIcon,
} from "./icons";
import { Analytics } from "./owner/analytics";
import { Bunting } from "./owner/bunting";
import { ConfirmDialog } from "./owner/confirm-dialog";
import { EstablishmentForm } from "./owner/establishment-form";
import { ErrorCallout, Loading } from "./owner/feedback";
import { ListConfiguration } from "./owner/list-configuration";
import { OwnerNavigation } from "./owner/navigation";
import { NightChip } from "./owner/night-chip";
import { QrCard } from "./owner/qr-card";
import { QueuePanel } from "./owner/queue-panel";
import { ThemeControls } from "./owner/theme-controls";
import { ToastProvider, useNotify } from "./owner/toast";

type View = (typeof VIEW)[keyof typeof VIEW];
const OWNER_CONTROL = {
  PAUSE: "pause",
  RESUME: "resume",
  SERVICE: "service",
  MAINTENANCE: "maintenance",
} as const;
type OwnerControl = (typeof OWNER_CONTROL)[keyof typeof OWNER_CONTROL];
const message = ownerError;
const READY = "Tu público ya puede unirse con el QR.";
const NOT_READY =
  "Ahora nadie puede unirse: revisa la noche y el horario del local.";
const CHECKING = "Comprobando si tu público puede unirse…";

export function AdminPanel(props: { authenticated: boolean; roles: string[] }) {
  return (
    <ToastProvider>
      <AdminPanelContent
        key={`${props.authenticated}:${props.roles.join(",")}`}
        {...props}
      />
    </ToastProvider>
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
  const notify = useNotify();
  const [api, setApi] = useState<DemoApi | null>(null);
  const [items, setItems] = useState<Establishment[]>([]);
  const [selected, setSelected] = useState<Establishment | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readiness, setReadiness] = useState(CHECKING);
  const [hasList, setHasList] = useState<boolean | null>(null);
  const [qr, setQr] = useState<Qr | null>(null);
  const [qrError, setQrError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState<View>(VIEW.PANEL);
  const generation = useRef(0);
  const pending = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      generation.current++;
      pending.current = false;
    },
    [],
  );
  const say = (text: string) => notify?.(text);
  function go(next: View) {
    setView(next);
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }

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
    setReadiness(CHECKING);
    setError("");
    setQrError("");
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
            setReadiness(value.puedeParticipar ? READY : NOT_READY);
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

  // Opening needs no confirmation; closing is confirmed in a modal dialog.
  async function mutate() {
    if (!api || !selected || !loaded || pending.current) return;
    const version = generation.current;
    pending.current = true;
    setBusy(true);
    setError("");
    setReadiness("Comprobando de nuevo…");
    setLoaded(false);
    try {
      if (session) {
        const result = await api.closeSession(session.id);
        if (version !== generation.current) return;
        setSession(null);
        setClosing(false);
        // The button that opened the dialog disappears with the session, so
        // the dialog cannot restore focus to it; move focus to the heading
        // after React has closed the dialog (next frame).
        requestAnimationFrame(() => headingRef.current?.focus());
        say(
          result.pendientesAlCierre
            ? `Noche cerrada. Quedaron ${plural(result.pendientesAlCierre, "solicitud", "solicitudes")} sin sonar.`
            : "Noche cerrada. No quedaron solicitudes pendientes.",
        );
      } else {
        const result = await api.openSession(selected.id);
        if (version !== generation.current) return;
        setSession(result);
        say("Noche abierta. Ya puedes compartir el QR.");
      }
      setLoaded(true);
      await refreshAvailability(api, selected, version);
    } catch (e) {
      if (version === generation.current) {
        setError(message(e));
        setLoaded(false);
        setClosing(false);
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
        setReadiness(value.puedeParticipar ? READY : NOT_READY);
    } catch {
      if (version === generation.current)
        setReadiness(
          "No pudimos comprobar si tu público puede unirse. Actualiza el estado.",
        );
    }
  }
  async function control(action: OwnerControl) {
    if (!api || !selected || !loaded || pending.current) return;
    const version = generation.current;
    pending.current = true;
    setBusy(true);
    setError("");
    setLoaded(false);
    try {
      if (action === "pause" || action === "resume") {
        const value =
          action === "pause"
            ? await api.pauseSession()
            : await api.resumeSession();
        if (version !== generation.current) return;
        setSession(value);
        say(
          action === "pause"
            ? "Pausa activada. Nadie puede pedir ni votar."
            : "Solicitudes y votos reanudados",
        );
      } else {
        const value =
          action === "service"
            ? await api.resumeService()
            : await api.endMaintenance();
        if (version !== generation.current) return;
        setSelected(value);
        say(
          action === "service"
            ? "Servicio del local reanudado"
            : "Mantenimiento terminado",
        );
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

  const connected = Boolean(api && selected);
  const canOpen =
    !!selected &&
    loaded &&
    !busy &&
    selected.activo &&
    !selected.pausado &&
    !selected.enMantenimiento &&
    !!hasList;

  return (
    <div className={`app${connected ? "" : " app--bare"}`}>
      <a className="skip" href="#main">
        Saltar al contenido
      </a>
      <header className="topbar">
        <a className="topbar__brand" href="/" aria-label="YouSong, inicio">
          <BrandMark size={30} />
          <span className="topbar__word" aria-hidden="true">
            YouSong
          </span>
        </a>
        {selected && (
          <span className="venue">
            <HeadphonesIcon size={18} className="venue__icon hide-xs" />
            <span className="venue__name">{selected.nombre}</span>
          </span>
        )}
        <span className="topbar__spacer" />
        <div className="topbar__actions">
          {selected && <NightChip session={loaded ? session : null} />}
          <ThemeControls />
          {authenticated && (
            <form action={logout}>
              <button
                type="submit"
                className="btn btn--ghost btn--icon"
                aria-label="Salir de la cuenta"
                title="Salir de la cuenta"
              >
                <LogoutIcon size={22} />
              </button>
            </form>
          )}
        </div>
      </header>
      {connected && (
        <aside className="sidebar">
          <p className="sidebar__label" id="nav-label">
            Operación del local
          </p>
          <OwnerNavigation view={view} onNavigate={go} />
          <div className="sidebar__footer">
            <p className="sidebar__motto">
              Una sala.
              <br />
              Muchas canciones.
            </p>
            {qr && (
              <a
                className="text-link"
                href={qr.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalIcon size={18} />
                Abrir enlace de acceso
                <span className="sr-only">(se abre en otra pestaña)</span>
              </a>
            )}
          </div>
        </aside>
      )}
      <main
        id="main"
        ref={mainRef}
        className="main"
        tabIndex={-1}
        aria-busy={busy}
      >
        <div className="content">
          {connected && (
            <div className="page-head">
              <div>
                <h1 ref={headingRef} className="page-head__title" tabIndex={-1}>
                  {view}
                </h1>
                <p className="page-head__subtitle">
                  {OWNER_VIEW_SUBTITLE[view]}
                </p>
              </div>
              {(busy || view === VIEW.PANEL || view === VIEW.SESSION) && (
                <div className="page-head__actions">
                  {busy && <Loading />}
                  {(view === VIEW.PANEL || view === VIEW.SESSION) && (
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={busy}
                      onClick={() => void connect()}
                    >
                      <RefreshIcon size={18} />
                      Actualizar estado
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {error && (
            <ErrorCallout
              error={error}
              action={
                api && (
                  <div>
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={busy}
                      onClick={() => void connect()}
                    >
                      Actualizar estado
                    </button>
                  </div>
                )
              }
            />
          )}
          {!api ? (
            <section className="stage signin" aria-labelledby="signin-title">
              <Bunting />
              <BrandMark size={44} className="signin__mark" />
              <h1 id="signin-title" className="signin__title">
                {authenticated ? "Preparando tu local" : "Entra a tu panel"}
              </h1>
              <p className="card__text">
                {authenticated
                  ? busy
                    ? "Cargando tu local, la noche y el QR…"
                    : "No pudimos cargar tu local. Revisa la conexión y vuelve a intentarlo."
                  : "Abre la noche, comparte el QR y controla la cola que vota tu público."}
              </p>
              {!authenticated && (
                <ul className="signin__steps">
                  <li>
                    <PlayIcon size={20} />
                    Abres la noche cuando empieza la música.
                  </li>
                  <li>
                    <QrIcon size={20} />
                    Tu público entra escaneando el QR.
                  </li>
                  <li>
                    <ArrowUpIcon size={20} />
                    Piden canciones y votan; tú ves la cola en vivo.
                  </li>
                </ul>
              )}
              {authenticated ? (
                <button
                  className="btn btn--primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void connect()}
                >
                  {busy ? "Conectando…" : "Reintentar conexión"}
                </button>
              ) : (
                <form action={login}>
                  <button className="btn btn--primary" type="submit">
                    Entrar con tu cuenta
                  </button>
                </form>
              )}
            </section>
          ) : !items.length ? (
            ownerAccess && (
              <section className="card card--narrow">
                <EstablishmentForm
                  key={`create:${selected?.id ?? "empty"}`}
                  api={api}
                  onSaved={saved}
                />
              </section>
            )
          ) : (
            selected && (
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
                  <details className="card disclosure card--disclosure">
                    <summary className="disclosure__summary">
                      Datos del local
                    </summary>
                    <div className="disclosure__body">
                      <EstablishmentForm
                        key={selected.id}
                        api={api}
                        current={selected}
                        onSaved={saved}
                      />
                    </div>
                  </details>
                )}
                {view === VIEW.PANEL && loaded && !session && (
                  <div className="callout callout--invite">
                    <PlayIcon size={24} />
                    <div className="callout__body">
                      <p className="callout__title">La noche está sin abrir</p>
                      <p className="muted">
                        Ábrela para que tu público pueda unirse con el QR y
                        pedir canciones.
                      </p>
                      <button
                        type="button"
                        className="btn btn--primary btn--small"
                        onClick={() => go(VIEW.SESSION)}
                      >
                        Ir a Noche y QR
                      </button>
                    </div>
                  </div>
                )}
                {view === VIEW.SESSION && (
                  <div className="grid-session">
                    <section className="card" aria-labelledby="qr-title">
                      <h2
                        id="qr-title"
                        className="card__title card__title--center"
                      >
                        Acceso para participantes
                      </h2>
                      {qr ? (
                        <QrCard qr={qr} />
                      ) : qrError ? (
                        <ErrorCallout error={qrError} />
                      ) : (
                        <Loading
                          label={busy ? "Cargando QR…" : "QR no disponible."}
                        />
                      )}
                    </section>
                    <section
                      className="card stack"
                      aria-labelledby="controls-title"
                    >
                      <h2 id="controls-title" className="card__title">
                        Controles de la noche
                      </h2>
                      {!loaded ? (
                        <Loading label="Comprobando la noche…" />
                      ) : session ? (
                        <>
                          <div className="stack stack--tight">
                            <p className="card__subtitle">
                              {nightLabel(session.fechaOperativa)}
                            </p>
                            <dl className="facts">
                              <dt>Estado</dt>
                              <dd>{sessionNotice(session.estado)}</dd>
                              <dt>Abierta desde</dt>
                              <dd>
                                {new Date(session.abiertaAt).toLocaleString(
                                  "es",
                                  {
                                    timeZone: selected.zonaHoraria,
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  },
                                )}
                              </dd>
                              <dt>Zona horaria</dt>
                              <dd>{timeZoneLabel(selected.zonaHoraria)}</dd>
                            </dl>
                          </div>
                          <p className="status-line">{readiness}</p>
                          {session.estado === "ABIERTA" && ownerAccess && (
                            <>
                              <button
                                type="button"
                                className="btn btn--pill"
                                disabled={busy || !loaded}
                                onClick={() => void control("pause")}
                              >
                                <PauseIcon size={20} />
                                Pausar solicitudes y votos
                              </button>
                              <p className="status-line">
                                Quienes ya entraron conservan el acceso, pero no
                                pueden pedir ni votar hasta que reanudes.
                              </p>
                            </>
                          )}
                          {session.estado === "PAUSADA" && ownerAccess && (
                            <button
                              type="button"
                              className="btn btn--primary btn--pill"
                              disabled={busy || !loaded}
                              onClick={() => void control("resume")}
                            >
                              <PlayIcon size={20} />
                              Reanudar solicitudes y votos
                            </button>
                          )}
                          {ownerAccess && (
                            <button
                              type="button"
                              className="btn btn--danger btn--pill"
                              disabled={busy || !loaded}
                              onClick={() => setClosing(true)}
                            >
                              <StopIcon size={20} />
                              Cerrar la noche
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="card__text">
                            La noche está sin abrir. Ábrela para que tu público
                            pueda unirse con el QR.
                          </p>
                          <ul
                            className="checklist"
                            aria-label="Requisitos para abrir"
                          >
                            {[
                              [selected.activo, "Local activo"],
                              [
                                !selected.pausado && !selected.enMantenimiento,
                                "Servicio sin pausa ni mantenimiento",
                              ],
                              [
                                !!hasList,
                                "Lista guardada en Configuración y listas",
                              ],
                            ].map(([ok, label]) => (
                              <li
                                key={String(label)}
                                className={`checklist__item${ok ? " checklist__item--ok" : ""}`}
                              >
                                {ok ? (
                                  <CheckIcon size={18} />
                                ) : (
                                  <CloseIcon size={18} />
                                )}
                                {label}
                                <span className="sr-only">
                                  {ok ? ": listo" : ": pendiente"}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {ownerAccess && (
                            <button
                              type="button"
                              className="btn btn--primary btn--pill"
                              disabled={!canOpen}
                              onClick={() => void mutate()}
                            >
                              <PlayIcon size={20} />
                              Abrir la noche
                            </button>
                          )}
                          <p className="status-line">
                            {readiness} El horario del local también decide
                            cuándo se puede participar.
                          </p>
                        </>
                      )}
                      {ownerAccess &&
                        (selected.pausado || selected.enMantenimiento) && (
                          <>
                            <hr className="card__divider" />
                            {selected.pausado && (
                              <button
                                type="button"
                                className="btn btn--muted btn--pill"
                                disabled={busy || !loaded}
                                onClick={() => void control("service")}
                              >
                                <PlayIcon size={20} />
                                Reanudar servicio del local
                              </button>
                            )}
                            {selected.enMantenimiento && (
                              <button
                                type="button"
                                className="btn btn--muted btn--pill"
                                disabled={busy || !loaded || !!session}
                                onClick={() => void control("maintenance")}
                              >
                                <WrenchIcon size={20} />
                                Terminar mantenimiento
                              </button>
                            )}
                          </>
                        )}
                    </section>
                  </div>
                )}
                {view === VIEW.ANALYTICS && (
                  <Analytics
                    key={`analytics:${selected.id}`}
                    api={api}
                    qrSlug={selected.qrSlug}
                    timeZone={selected.zonaHoraria}
                    onOpenNight={() => go(VIEW.SESSION)}
                  />
                )}
                {(view === VIEW.PANEL || view === VIEW.QUEUE) && (
                  <QueuePanel
                    key={`queue:${view}:${selected.id}:${session?.id ?? "none"}:${session?.estado}:${selected.pausado}:${selected.enMantenimiento}:${loaded}`}
                    api={api}
                    establishment={selected}
                    session={loaded ? session : null}
                    showPlaybackControls={view === VIEW.PANEL}
                    onShowAll={() => go(VIEW.QUEUE)}
                    onShowQr={() => go(VIEW.SESSION)}
                  />
                )}
              </>
            )
          )}
        </div>
      </main>
      <ConfirmDialog
        open={closing}
        title="¿Cerrar la noche?"
        confirmLabel="Cerrar la noche"
        cancelLabel="Seguir con la noche"
        busy={busy}
        onConfirm={() => void mutate()}
        onCancel={() => setClosing(false)}
      >
        <p>
          Los celulares conectados perderán el acceso. El historial de la noche
          se conserva.
        </p>
        <p>Las solicitudes que no sonaron quedan sin atender.</p>
      </ConfirmDialog>
    </div>
  );
}

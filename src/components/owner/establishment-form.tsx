"use client";

import { useId, useState } from "react";
import type { Establishment } from "../../lib/admin-api";
import type { DemoApi } from "../../lib/demo-api";
import { slug as validSlug } from "../../lib/demo-contracts";
import {
  isValidTimeZone,
  OTHER_TIME_ZONE,
  timeZoneChoice,
  timeZoneOptions,
} from "../../lib/time-zones";
import { OperationStatus, useOwnerOperation } from "./operation";

export function EstablishmentForm({
  api,
  current,
  onSaved,
}: {
  api: DemoApi;
  current?: Establishment;
  onSaved: (value: Establishment) => void;
}) {
  const [name, setName] = useState(current?.nombre ?? "");
  const initialZone = timeZoneChoice(current?.zonaHoraria);
  const [zoneChoice, setZoneChoice] = useState(initialZone.choice);
  const [customZone, setCustomZone] = useState(initialZone.custom);
  const [zoneTried, setZoneTried] = useState(false);
  const [slug, setSlug] = useState("");
  const [active, setActive] = useState(current?.activo ?? true);
  const op = useOwnerOperation();
  const [uncertain, setUncertain] = useState(false);
  const [found, setFound] = useState<Establishment[]>([]);
  const ids = {
    slug: useId(),
    slugError: useId(),
    zone: useId(),
    customZone: useId(),
    zoneHint: useId(),
    zoneError: useId(),
    active: useId(),
  };
  const slugInvalid = slug.length > 0 && !validSlug(slug);
  const otherZone = zoneChoice === OTHER_TIME_ZONE;
  const zone = otherZone ? customZone.trim() : zoneChoice;
  const zoneInvalid =
    otherZone && (customZone.length > 0 || zoneTried) && !isValidTimeZone(zone);
  return (
    <div className="stack">
      {!current && (
        <div>
          <h2 className="card__title">Crea tu local</h2>
          <p className="card__text">
            Con el nombre y la zona horaria basta para empezar. Después podrás
            preparar la lista y abrir la sesión.
          </p>
        </div>
      )}
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          setZoneTried(true);
          if (slugInvalid || !isValidTimeZone(zone)) return;
          void op.run(async (commit) => {
            if (uncertain) return;
            let saved: Establishment;
            try {
              saved = current
                ? await api.updateEstablishment(current.id, {
                    nombre: name,
                    zonaHoraria: zone,
                    activo: active,
                  })
                : await api.createEstablishment({
                    nombre: name,
                    zonaHoraria: zone,
                    ...(slug ? { qrSlug: slug } : {}),
                  });
            } catch (error) {
              // A lost response may follow a committed write. Require reconciliation,
              // especially for create (where retry could create another record).
              commit(() => setUncertain(true));
              throw error;
            }
            commit(() => {
              op.setNotice(
                current
                  ? "Datos del local guardados"
                  : `Local creado: ${saved.nombre}`,
              );
              onSaved(saved);
            });
          });
        }}
      >
        <fieldset className="form" disabled={op.busy || uncertain}>
          <legend className="sr-only">Datos del local</legend>
          <label className="field">
            <span className="field__label">Nombre del local</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={120}
              autoComplete="organization"
            />
          </label>
          <div className="field">
            <label className="field__label" htmlFor={ids.zone}>
              Zona horaria
            </label>
            <select
              id={ids.zone}
              className="select"
              value={zoneChoice}
              onChange={(event) => setZoneChoice(event.target.value)}
              required
            >
              {timeZoneOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {otherZone && (
            <div className="field">
              <label className="field__label" htmlFor={ids.customZone}>
                Zona horaria (IANA)
              </label>
              <input
                id={ids.customZone}
                className="input"
                value={customZone}
                onChange={(event) => setCustomZone(event.target.value)}
                required
                maxLength={64}
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={zoneInvalid}
                aria-describedby={
                  zoneInvalid
                    ? `${ids.zoneError} ${ids.zoneHint}`
                    : ids.zoneHint
                }
              />
              <p id={ids.zoneHint} className="field__hint">
                Escribe el nombre de la zona tal como lo usa tu sistema, por
                ejemplo America/Chicago o Europe/London.
              </p>
              {zoneInvalid && (
                <p id={ids.zoneError} className="field__error">
                  Escribe una zona válida, por ejemplo America/Chicago.
                </p>
              )}
            </div>
          )}
          {!current && (
            <div className="field">
              <label className="field__label" htmlFor={ids.slug}>
                Enlace del QR (opcional)
              </label>
              <input
                id={ids.slug}
                className="input"
                value={slug}
                onChange={(event) => setSlug(event.target.value.trim())}
                pattern="[a-z0-9\-]{3,80}"
                maxLength={80}
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={slugInvalid}
                aria-describedby={
                  slugInvalid
                    ? `${ids.slugError} ${ids.slug}-hint`
                    : `${ids.slug}-hint`
                }
              />
              <p id={`${ids.slug}-hint`} className="field__hint">
                Es el final del enlace que abre el QR. Usa de 3 a 80 letras
                minúsculas, números o guiones, por ejemplo sala-azul. Si lo
                dejas vacío lo creamos por ti. No se puede cambiar después.
              </p>
              {slugInvalid && (
                <p id={ids.slugError} className="field__error">
                  Usa solo minúsculas sin tildes, números y guiones (3 a 80).
                </p>
              )}
            </div>
          )}
          {current && (
            <div className="field">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={active}
                  aria-describedby={ids.active}
                  onChange={(event) => setActive(event.target.checked)}
                />
                <span>Local activo</span>
              </label>
              <p id={ids.active} className="field__hint">
                Si lo desactivas, nadie podrá unirse. Finaliza la sesión antes
                de hacerlo. El enlace del QR ({current.qrSlug}) no cambia.
              </p>
            </div>
          )}
          <div className="form-actions">
            <button type="submit" className="btn btn--primary">
              {current ? "Guardar datos del local" : "Crear local"}
            </button>
          </div>
        </fieldset>
      </form>
      <OperationStatus {...op} />
      {uncertain && (
        <div className="callout callout--warn" role="alert">
          <div className="callout__body">
            <p>
              No sabemos si se guardó. Tus datos siguen aquí: revisa el local
              antes de repetir.
            </p>
            <div>
              <button
                type="button"
                className="btn btn--small"
                disabled={op.busy}
                onClick={() =>
                  void op.run(async (commit) => {
                    const items = await api.establishments();
                    commit(() => {
                      setUncertain(false);
                      op.setNotice(
                        "Revisamos tu local. Confirma los datos antes de volver a guardar.",
                      );
                    });
                    if (current) {
                      const fresh = items.find(
                        (item) => item.id === current.id,
                      );
                      if (fresh) commit(() => onSaved(fresh));
                    } else {
                      // Show potential creations without replacing the draft or selecting a
                      // guessed match. The operator explicitly chooses an acknowledged record.
                      commit(() => setFound(items));
                    }
                  })
                }
              >
                Revisar antes de repetir
              </button>
            </div>
          </div>
        </div>
      )}
      <FoundEstablishments items={found} onSelect={onSaved} />
    </div>
  );
}
function FoundEstablishments({
  items,
  onSelect,
}: {
  items: Establishment[];
  onSelect: (value: Establishment) => void;
}) {
  return (
    items.length > 0 && (
      <ul className="cluster" aria-label="Locales encontrados">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="btn"
              onClick={() => onSelect(item)}
            >
              Usar {item.nombre}
            </button>
          </li>
        ))}
      </ul>
    )
  );
}

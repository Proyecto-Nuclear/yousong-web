"use client";

import { useState } from "react";
import type { Establishment } from "@/lib/admin-api";
import type { DemoApi } from "@/lib/demo-api";
import { OperationStatus, useDemoOperation } from "./operation";

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
  const [zone, setZone] = useState(current?.zonaHoraria ?? "America/Bogota");
  const [slug, setSlug] = useState("");
  const [active, setActive] = useState(current?.activo ?? true);
  const op = useDemoOperation();
  const [uncertain, setUncertain] = useState(false);
  const [found, setFound] = useState<Establishment[]>([]);
  return (
    <section className="card demo-form">
      <h2>
        {current ? "Configurar establecimiento" : "Crear establecimiento"}
      </h2>
      <p>
        {current
          ? "El identificador QR no se puede modificar. Desactivar requiere finalizar la sesión."
          : "Crea un establecimiento real en el servidor. No se generan datos de demostración."}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
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
              op.setNotice("Establecimiento guardado en el servidor.");
              onSaved(saved);
            });
          });
        }}
      >
        <fieldset disabled={op.busy || uncertain}>
          <label>
            Nombre
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label>
            Zona horaria IANA
            <input
              value={zone}
              onChange={(event) => setZone(event.target.value)}
              required
              maxLength={64}
            />
          </label>
          {!current && (
            <label>
              Identificador QR opcional
              <input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                pattern="[a-z0-9-]{3,80}"
                maxLength={80}
              />
            </label>
          )}
          {current && (
            <label className="demo-checkbox">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              Establecimiento activo
            </label>
          )}
          <button type="submit">
            {current ? "Guardar configuración" : "Crear establecimiento"}
          </button>
        </fieldset>
      </form>
      <OperationStatus {...op} />
      {uncertain && (
        <>
          <p>
            El borrador se conserva. Consulta los establecimientos antes de
            repetir: el resultado podría ser incierto.
          </p>
          <button
            type="button"
            disabled={op.busy}
            onClick={() =>
              void op.run(async (commit) => {
                const items = await api.establishments();
                commit(() => {
                  setUncertain(false);
                  op.setNotice(
                    "Establecimientos consultados. Revisa los datos antes de volver a guardar.",
                  );
                });
                if (current) {
                  const fresh = items.find((item) => item.id === current.id);
                  if (fresh) commit(() => onSaved(fresh));
                } else {
                  // Show potential creations without replacing the draft or selecting a
                  // guessed match. The operator explicitly chooses an acknowledged record.
                  commit(() => setFound(items));
                }
              })
            }
          >
            Consultar antes de repetir
          </button>
        </>
      )}
      <FoundEstablishments items={found} onSelect={onSaved} />
    </section>
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
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => onSelect(item)}>
              {item.nombre} · {item.qrSlug}
            </button>
          </li>
        ))}
      </ul>
    )
  );
}

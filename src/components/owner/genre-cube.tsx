"use client";

import { type CSSProperties, type PointerEvent, useRef, useState } from "react";
import {
  type CubeModel,
  cellAt,
  cellLabel,
  hourLabel,
} from "../../lib/analytics-insights";

const DEFAULT_VIEW = { rx: -24, ry: 34 };
const STEP = 15;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Heat of a cell, 0..100, relative to the largest share in the cube. */
function heat(value: number | null, max: number) {
  if (value === null || !(max > 0)) return 0;
  return Math.round(14 + (86 * value) / max);
}

/**
 * Chart 9 as a cube: hours (x) by genres (y) by nights (z). The front layer
 * is the night from the live endpoint; the published nights stack behind.
 * Choosing a night slides the stack so that night sits in front for reading.
 */
export function GenreCube({
  model,
  selected: controlled,
  onSelect,
  reducedMotion = false,
}: {
  model: CubeModel;
  selected?: number;
  onSelect?: (index: number) => void;
  reducedMotion?: boolean;
}) {
  const [own, setOwn] = useState(0);
  const [view, setView] = useState(DEFAULT_VIEW);
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(
    null,
  );
  const selected = clamp(
    controlled ?? own,
    0,
    Math.max(0, model.layers.length - 1),
  );
  const choose = (index: number) => {
    setOwn(index);
    onSelect?.(index);
  };
  const rotate = (drx: number, dry: number) =>
    setView((current) => ({
      rx: clamp(current.rx + drx, -70, 20),
      ry: clamp(current.ry + dry, -80, 80),
    }));
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ...view };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    setView({
      rx: clamp(start.rx - (event.clientY - start.y) * 0.4, -70, 20),
      ry: clamp(start.ry + (event.clientX - start.x) * 0.4, -80, 80),
    });
  };
  const endDrag = () => {
    drag.current = null;
  };
  const layer = model.layers[selected];
  const style = {
    "--rx": `${view.rx}deg`,
    "--ry": `${view.ry}deg`,
    "--cols": model.hours.length,
    "--rows": model.genres.length,
    "--front": selected,
  } as CSSProperties;
  return (
    <div className={`cube${reducedMotion ? " cube--still" : ""}`}>
      <fieldset className="cube__layers">
        <legend className="cube__legend">Jornada al frente</legend>
        <div className="cube__chips">
          {model.layers.map((item, index) => (
            <label key={item.id} className="cube__chip">
              <input
                type="radio"
                name="cube-layer"
                value={item.id}
                checked={index === selected}
                onChange={() => choose(index)}
              />
              {item.live ? `${item.label} (en vivo)` : item.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div
        className="cube__stage"
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div aria-hidden="true" className="cube__scene">
          {model.layers.map((item, index) => {
            const state =
              index < selected
                ? "peeled"
                : index === selected
                  ? "front"
                  : "back";
            return (
              <div
                key={item.id}
                className={`cube__layer cube__layer--${state}${item.live ? " cube__layer--live" : ""}`}
                style={{ "--i": index } as CSSProperties}
              >
                <span className="cube__zlabel">
                  {item.label}
                  {item.live ? " · en vivo" : ""}
                </span>
                {state === "front" && (
                  <>
                    {model.genres.map((genre, row) => (
                      <span
                        key={genre}
                        className="cube__ylabel"
                        style={{ gridRow: row + 1 } as CSSProperties}
                        title={genre}
                      >
                        {genre}
                      </span>
                    ))}
                    {model.hours.map((h, col) => (
                      <span
                        key={h}
                        className="cube__xlabel"
                        style={{ gridColumn: col + 2 } as CSSProperties}
                      >
                        {hourLabel(h).replace(/ [ap]\. m\.$/, "")}
                        <span className="cube__ampm">
                          {hourLabel(h).slice(-6)}
                        </span>
                      </span>
                    ))}
                  </>
                )}
                {model.genres.map((genre, row) =>
                  model.hours.map((h, col) => {
                    const cell = cellAt(item, genre, h);
                    const value = heat(cell?.porcentaje ?? null, model.max);
                    return (
                      <span
                        key={`${genre}:${h}`}
                        className={`cube__cell${cell?.suprimida ? " cube__cell--hidden" : ""}${cell ? "" : " cube__cell--none"}${value > 48 ? " cube__cell--hot" : ""}`}
                        style={
                          {
                            gridRow: row + 1,
                            gridColumn: col + 2,
                            "--heat": `${value}%`,
                          } as CSSProperties
                        }
                      >
                        {state === "front" && cell ? cellLabel(cell) : ""}
                      </span>
                    );
                  }),
                )}
              </div>
            );
          })}
        </div>
      </div>
      <fieldset className="cube__controls">
        <legend className="sr-only">Girar el cubo</legend>
        <button
          type="button"
          className="btn btn--small btn--muted"
          onClick={() => rotate(0, -STEP)}
        >
          Girar a la izquierda
        </button>
        <button
          type="button"
          className="btn btn--small btn--muted"
          onClick={() => rotate(0, STEP)}
        >
          Girar a la derecha
        </button>
        <button
          type="button"
          className="btn btn--small btn--muted"
          onClick={() => rotate(STEP, 0)}
        >
          Inclinar hacia arriba
        </button>
        <button
          type="button"
          className="btn btn--small btn--muted"
          onClick={() => rotate(-STEP, 0)}
        >
          Inclinar hacia abajo
        </button>
        <button
          type="button"
          className="btn btn--small btn--muted"
          onClick={() => setView({ rx: 0, ry: 0 })}
        >
          Vista de frente
        </button>
      </fieldset>
      <p className="cube__key">
        <span className="cube__ramp" aria-hidden="true" />
        Más claro, menos solicitudes; más intenso, más. «&lt; 5» oculta una
        celda con menos de 5 participantes.
      </p>
      {layer && (
        <details className="chart__more">
          <summary>Ver como tabla</summary>
          <div className="table-wrap">
            <table className="data-table">
              <caption>
                Porcentaje de solicitudes por género y hora, jornada del{" "}
                {layer.label}
                {layer.live ? " (en vivo)" : ""}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Género</th>
                  {model.hours.map((h) => (
                    <th scope="col" key={h}>
                      {hourLabel(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.genres.map((genre) => (
                  <tr key={genre}>
                    <th scope="row">{genre}</th>
                    {model.hours.map((h) => (
                      <td key={h}>{cellLabel(cellAt(layer, genre, h))}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

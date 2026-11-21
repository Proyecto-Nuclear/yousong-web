"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import {
  barShare,
  hasHighlights,
  periodLabel,
  playedAgo,
  timesValue,
  topGenres,
  votesValue,
} from "../../lib/analytics";
import type { DemoApi } from "../../lib/demo-api";
import {
  type Highlights,
  PERIODS,
  type QueueSong,
} from "../../lib/demo-contracts";
import { Cover } from "../cover";
import { ChartIcon } from "../icons";
import { EmptyState, ErrorCallout, SkeletonRows } from "./feedback";
import { Equalizer } from "./queue-panel";
import { SongMeta } from "./song-meta";

export const NO_DATA = "Aún no hay datos en este periodo";

type Tone = "votes" | "requests" | "plays";

function Bar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  return (
    <span className="bar">
      <span className="bar__track" aria-hidden="true">
        <span
          className="bar__fill"
          style={{ "--share": `${barShare(value, max)}%` } as CSSProperties}
        />
      </span>
      <span className="bar__value">{label}</span>
    </span>
  );
}

function RankRow({
  position,
  song,
  children,
}: {
  position: number;
  song: QueueSong;
  children: ReactNode;
}) {
  return (
    <li className="rank">
      <span className="rank__pos" aria-hidden="true">
        {position}
      </span>
      <Cover title={song.titulo} size={40} />
      <div className="rank__body">
        <p className="rank__title" title={song.titulo}>
          <span className="sr-only">{position}. </span>
          {song.titulo}
        </p>
        <SongMeta artist={song.artista} genre={song.genero} />
        {children}
      </div>
    </li>
  );
}

/** One ranked list with bars proportional to its top value. */
export function RankCard({
  id,
  title,
  tone,
  items,
}: {
  id: string;
  title: string;
  tone: Tone;
  items: { song: QueueSong; value: number; label: string }[];
}) {
  const max = Math.max(0, ...items.map((item) => item.value));
  return (
    <section className={`card rank-card--${tone}`} aria-labelledby={id}>
      <h2 id={id} className="card__title card__head">
        {title}
      </h2>
      {items.length ? (
        // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics with list-style none; the role restores them.
        // biome-ignore lint/a11y/useSemanticElements: it is an <ol>; the explicit role restores list semantics Safari drops with list-style none.
        <ol className="rank-list" role="list">
          {items.map((item, index) => (
            <RankRow
              key={`${item.song.videoId}:${index}`}
              position={index + 1}
              song={item.song}
            >
              <Bar value={item.value} max={max} label={item.label} />
            </RankRow>
          ))}
        </ol>
      ) : (
        <EmptyState title={NO_DATA} />
      )}
    </section>
  );
}

function LastPlayed({
  items,
  timeZone,
  now,
}: {
  items: Highlights["ultimasSonadas"];
  timeZone?: string;
  now: number;
}) {
  return (
    <section className="card" aria-labelledby="stats-last">
      <h2 id="stats-last" className="card__title card__head">
        Últimas 10 sonadas
      </h2>
      {items.length ? (
        // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics with list-style none; the role restores them.
        // biome-ignore lint/a11y/useSemanticElements: it is an <ol>; the explicit role restores list semantics Safari drops with list-style none.
        <ol className="rank-list" role="list">
          {items.map((item, index) => (
            <RankRow
              key={`${item.cancion.videoId}:${item.sonoAt}`}
              position={index + 1}
              song={item.cancion}
            >
              {item.enCurso ? (
                <span className="rank__now">
                  <Equalizer on />
                  Sonando ahora
                </span>
              ) : (
                <span className="rank__when">
                  {playedAgo(item.sonoAt, now, timeZone)}
                </span>
              )}
            </RankRow>
          ))}
        </ol>
      ) : (
        <EmptyState title={NO_DATA} />
      )}
    </section>
  );
}

function Genres({ data }: { data: Highlights }) {
  const genres = topGenres(data.masPedidas);
  if (!genres.length) return null;
  const max = genres[0].veces;
  return (
    <section className="card" aria-labelledby="stats-genres">
      <div className="card__head">
        <div>
          <h2 id="stats-genres" className="card__title">
            Géneros más pedidos
          </h2>
          <p className="card__meta">
            Según las canciones más pedidas con género conocido.
          </p>
        </div>
      </div>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics with list-style none; the role restores them. */}
      {/* biome-ignore lint/a11y/useSemanticElements: it is a <ul>; the explicit role restores list semantics Safari drops with list-style none. */}
      <ul className="genres" role="list">
        {genres.map((genre) => (
          <li key={genre.genero} className="genre">
            <span className="genre__name">{genre.genero}</span>
            <Bar
              value={genre.veces}
              max={max}
              label={`${timesValue(genre.veces)} (${genre.share} %)`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HighlightsView({
  data,
  timeZone,
  now,
}: {
  data: Highlights;
  timeZone?: string;
  now: number;
}) {
  return (
    <>
      <Genres data={data} />
      <div className="grid-analytics">
        <RankCard
          id="stats-votes"
          title="Más votadas"
          tone="votes"
          items={data.masVotadas.map((item) => ({
            song: item.cancion,
            value: item.votos,
            label: votesValue(item.votos),
          }))}
        />
        <RankCard
          id="stats-requests"
          title="Más pedidas"
          tone="requests"
          items={data.masPedidas.map((item) => ({
            song: item.cancion,
            value: item.veces,
            label: timesValue(item.veces),
          }))}
        />
        <RankCard
          id="stats-plays"
          title="Más sonadas"
          tone="plays"
          items={data.masSonadas.map((item) => ({
            song: item.cancion,
            value: item.reproducciones,
            label: timesValue(item.reproducciones),
          }))}
        />
        <LastPlayed items={data.ultimasSonadas} timeZone={timeZone} now={now} />
      </div>
    </>
  );
}

function LoadingCards() {
  return (
    <div className="grid-analytics" aria-hidden="true">
      {["a", "b", "c", "d"].map((key) => (
        <div key={key} className="card">
          <span className="skeleton__block skeleton__title" />
          <SkeletonRows count={4} />
        </div>
      ))}
    </div>
  );
}

/** Owner-local analytics from the public highlights of the venue. */
export function Analytics({
  api,
  qrSlug,
  timeZone,
  onOpenNight,
}: {
  api: DemoApi;
  qrSlug: string;
  timeZone?: string;
  /** Navigates to Noche y QR (empty analytics next action). */
  onOpenNight?: () => void;
}) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Highlights | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger.
  useEffect(() => {
    let current = true;
    setData(null);
    setError("");
    api
      .highlights(qrSlug, days)
      .then((value) => {
        if (!current) return;
        setNow(Date.now());
        setData(value);
      })
      .catch((reason) => {
        if (current)
          setError(reason instanceof Error ? reason.message : "Sin detalle");
      });
    return () => {
      current = false;
    };
  }, [api, qrSlug, days, attempt]);
  const loading = !data && !error;
  return (
    <div className="stack stack--loose" aria-busy={loading}>
      <div className="period">
        <fieldset className="segmented segmented--compact">
          <legend className="sr-only">Periodo</legend>
          <div className="segmented__options">
            {PERIODS.map((value) => (
              <label key={value} className="segmented__option">
                <input
                  type="radio"
                  name="analytics-period"
                  value={value}
                  checked={days === value}
                  onChange={() => setDays(value)}
                />
                {value} días
              </label>
            ))}
          </div>
        </fieldset>
        <p className="status-line">
          {loading ? "Cargando…" : periodLabel(data?.periodoDias ?? days)}
        </p>
      </div>
      {error ? (
        <ErrorCallout
          error={error}
          action={
            <button
              type="button"
              className="btn btn--small"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Reintentar
            </button>
          }
        />
      ) : data ? (
        <>
          {!hasHighlights(data) && (
            <EmptyState
              title="La analítica se llena con cada noche"
              icon={<ChartIcon size={22} />}
              action={
                onOpenNight && (
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={onOpenNight}
                  >
                    Ir a Noche y QR
                  </button>
                )
              }
            >
              Abre la noche y deja que tu público pida y vote: aquí verás lo que
              más se vota, se pide y suena en tu local.
            </EmptyState>
          )}
          <HighlightsView data={data} timeZone={timeZone} now={now} />
        </>
      ) : (
        <LoadingCards />
      )}
    </div>
  );
}

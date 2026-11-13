"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  readTheme,
  resolveTheme,
  type Theme,
  writeTheme,
} from "../../lib/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "../icons";

const CHANGE = "yousong-theme-change";
const media = () =>
  typeof window === "undefined"
    ? null
    : window.matchMedia("(prefers-color-scheme: light)");
const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

function apply(theme: Theme, fromUser: boolean) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (fromUser) root.dataset.themeSource = "user";
  else delete root.dataset.themeSource;
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGE, listener);
  return () => window.removeEventListener(CHANGE, listener);
}
// Snapshot encodes the effective theme and whether it follows the system.
const snapshot = () =>
  `${document.documentElement.dataset.theme === "light" ? "light" : "dark"}:${
    document.documentElement.dataset.themeSource === "user" ? "user" : "system"
  }`;

export function ThemeControls() {
  const state = useSyncExternalStore(subscribe, snapshot, () => "dark:system");
  const [theme, source] = state.split(":") as [Theme, "user" | "system"];
  const followsSystem = source === "system";

  // While following the system, react to OS theme changes live.
  useEffect(() => {
    const query = media();
    if (!query || !followsSystem) return;
    const update = () => apply(query.matches ? "light" : "dark", false);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [followsSystem]);

  const nextTheme: Theme = theme === "dark" ? "light" : "dark";
  return (
    <>
      <button
        type="button"
        className="btn"
        aria-label={
          nextTheme === "light" ? "Usar tema claro" : "Usar tema oscuro"
        }
        onClick={() => {
          writeTheme(storage(), nextTheme);
          apply(nextTheme, true);
        }}
      >
        {nextTheme === "light" ? <SunIcon size={20} /> : <MoonIcon size={20} />}
        <span className="hide-sm" aria-hidden="true">
          {nextTheme === "light" ? "Claro" : "Oscuro"}
        </span>
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        aria-label="Seguir el tema del dispositivo"
        aria-pressed={followsSystem}
        onClick={() => {
          writeTheme(storage(), null);
          apply(resolveTheme(readTheme(storage()), !!media()?.matches), false);
        }}
      >
        <MonitorIcon size={22} />
      </button>
    </>
  );
}

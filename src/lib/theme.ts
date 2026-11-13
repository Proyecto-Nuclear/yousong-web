// Theme preference: "light" | "dark" stored explicitly, or absent to follow the
// operating system. Storage access can throw (private mode, blocked site data).

export type Theme = "light" | "dark";
export const THEME_KEY = "yousong-theme";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readTheme(storage: StorageLike | undefined): Theme | null {
  try {
    const value = storage?.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/** Persists an explicit choice; null clears it so the system preference wins. */
export function writeTheme(
  storage: StorageLike | undefined,
  theme: Theme | null,
): boolean {
  try {
    if (theme) storage?.setItem(THEME_KEY, theme);
    else storage?.removeItem(THEME_KEY);
    return true;
  } catch {
    return false;
  }
}

export function resolveTheme(stored: Theme | null, prefersLight: boolean) {
  return stored ?? (prefersLight ? "light" : "dark");
}

// Runs before first paint (inlined in <head>) so the page never flashes the
// wrong theme. Kept dependency-free and wrapped in try/catch.
export const THEME_BOOT_SCRIPT = `(function(){try{var s=null;try{s=localStorage.getItem("${THEME_KEY}")}catch(e){}var u=s==="light"||s==="dark";var t=u?s:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.theme=t;if(u)document.documentElement.dataset.themeSource="user"}catch(e){}})();`;

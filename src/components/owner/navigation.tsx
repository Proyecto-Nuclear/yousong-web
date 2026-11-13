"use client";

import { OWNER_VIEW_SHORT, OWNER_VIEWS as VIEW } from "../../lib/owner-copy";
import { HomeIcon, QrIcon, QueueIcon, SettingsIcon } from "../icons";

type View = (typeof VIEW)[keyof typeof VIEW];
const VIEW_ICON = {
  [VIEW.PANEL]: HomeIcon,
  [VIEW.SESSION]: QrIcon,
  [VIEW.QUEUE]: QueueIcon,
  [VIEW.SETUP]: SettingsIcon,
} as const;

export function OwnerNavigation({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  return (
    <nav className="sidebar__nav" aria-labelledby="nav-label">
      {Object.values(VIEW).map((name) => {
        const NavIcon = VIEW_ICON[name];
        const shortName = OWNER_VIEW_SHORT[name];
        const label = name.includes(shortName) ? name : `${shortName}: ${name}`;
        return (
          <button
            key={name}
            type="button"
            className="nav-item"
            data-view={name}
            aria-label={label}
            aria-current={view === name ? "page" : undefined}
            onClick={() => onNavigate(name)}
          >
            <NavIcon size={22} />
            <span className="nav-item__long">{name}</span>
            <span className="nav-item__short" aria-hidden="true">
              {OWNER_VIEW_SHORT[name]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

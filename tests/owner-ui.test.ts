import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ConfirmDialog,
  cancelDialog,
  syncDialog,
} from "../src/components/owner/confirm-dialog";
import { EstablishmentForm } from "../src/components/owner/establishment-form";
import { qrBlobs } from "../src/components/owner/qr-card";
import { ThemeControls } from "../src/components/owner/theme-controls";
import { createToastActions } from "../src/components/owner/toast";
import { DemoApi } from "../src/lib/demo-api";
import { ListDraft } from "../src/lib/list-draft";
import { ownerError } from "../src/lib/owner-copy";
import { THEME_BOOT_SCRIPT } from "../src/lib/theme";
import {
  isValidTimeZone,
  OTHER_TIME_ZONE,
  TIME_ZONES,
  timeZoneChoice,
  timeZoneOptions,
} from "../src/lib/time-zones";

const noRequests = () =>
  new DemoApi(async () => {
    throw Error("unexpected request");
  });
const establishment = (zonaHoraria: string) => ({
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Sala",
  qrSlug: "sala",
  zonaHoraria,
  activo: true,
  pausado: false,
  enMantenimiento: false,
  creadoAt: "2026-06-01T00:00:00Z",
});

test("time zones keep the curated list and accept any valid IANA zone", () => {
  assert.equal(TIME_ZONES[0].value, "America/Bogota");
  const options = timeZoneOptions();
  assert.equal(options.at(-1)?.value, OTHER_TIME_ZONE);
  assert.equal(options.at(-1)?.label, "Otra zona (IANA)");
  for (const zone of ["America/Chicago", "Europe/London", "UTC"])
    assert.equal(isValidTimeZone(zone), true, zone);
  for (const zone of ["", "America/Atlantis", "bogota", "Europe/London "])
    assert.equal(isValidTimeZone(zone), false, zone);
  assert.deepEqual(timeZoneChoice("America/Lima"), {
    choice: "America/Lima",
    custom: "",
  });
  assert.deepEqual(timeZoneChoice("Europe/London"), {
    choice: OTHER_TIME_ZONE,
    custom: "Europe/London",
  });
});

test("a saved zone outside the list stays selected and visible for editing", () => {
  const html = renderToStaticMarkup(
    createElement(EstablishmentForm, {
      api: noRequests(),
      current: establishment("Europe/London"),
      onSaved() {},
    }),
  );
  assert.match(
    html,
    new RegExp(
      `<option value="${OTHER_TIME_ZONE}" selected="">Otra zona \\(IANA\\)</option>`,
    ),
  );
  assert.match(html, /<input[^>]*value="Europe\/London"/);
  assert.doesNotMatch(html, /Escribe una zona válida/);
  const listed = renderToStaticMarkup(
    createElement(EstablishmentForm, {
      api: noRequests(),
      current: establishment("America/Bogota"),
      onSaved() {},
    }),
  );
  assert.match(listed, /<option value="America\/Bogota" selected="">/);
  assert.doesNotMatch(listed, /value="America\/Bogota"[^>]*aria-invalid/);
});

test("an invalid saved zone shows a friendly, described error", () => {
  const html = renderToStaticMarkup(
    createElement(EstablishmentForm, {
      api: noRequests(),
      current: establishment("Mars/Olympus"),
      onSaved() {},
    }),
  );
  const error =
    /<p id="([^"]+)" class="field__error">Escribe una zona válida, por ejemplo America\/Chicago\.<\/p>/.exec(
      html,
    );
  assert.ok(error);
  assert.match(
    html,
    new RegExp(
      `<input[^>]*aria-invalid="true"[^>]*aria-describedby="[^"]*${error[1]}`,
    ),
  );
});

test("dialog autofocuses the safe choice and disables both actions while busy", () => {
  const props = {
    title: "¿Finalizar la sesión de esta noche?",
    confirmLabel: "Finalizar sesión",
    cancelLabel: "Seguir con la sesión",
    onConfirm() {},
    onCancel() {},
  };
  const idle = renderToStaticMarkup(
    createElement(ConfirmDialog, { ...props, open: false }),
  );
  assert.match(
    idle,
    /<button[^>]*autofocus=""[^>]*>Seguir con la sesión<\/button>/,
  );
  assert.doesNotMatch(idle, /autofocus=""[^>]*>Finalizar sesión</);
  const busy = renderToStaticMarkup(
    createElement(ConfirmDialog, { ...props, open: true, busy: true }),
  );
  assert.match(
    busy,
    /<button[^>]*disabled=""[^>]*>Seguir con la sesión<\/button>/,
  );
  assert.match(busy, /<button[^>]*disabled=""[^>]*>Un momento…<\/button>/);
});

function fakeDialog(open = false) {
  const calls: string[] = [];
  return {
    calls,
    open,
    showModal() {
      calls.push("showModal");
      this.open = true;
    },
    close() {
      calls.push("close");
      this.open = false;
    },
  };
}

test("dialog opens modally and closes once the action succeeds", () => {
  const dialog = fakeDialog();
  syncDialog(dialog, true);
  syncDialog(dialog, true);
  assert.deepEqual(dialog.calls, ["showModal"]);
  // The parent sets open=false after a confirmed close.
  syncDialog(dialog, false);
  syncDialog(dialog, false);
  assert.deepEqual(dialog.calls, ["showModal", "close"]);
  syncDialog(null, true);
});

test("Escape (cancel event) cancels only when not busy and never closes natively", () => {
  let prevented = 0;
  let cancelled = 0;
  const event = { preventDefault: () => prevented++ };
  cancelDialog(event, false, () => cancelled++);
  cancelDialog(event, true, () => cancelled++);
  assert.equal(prevented, 2);
  assert.equal(cancelled, 1);
});

function boot(stored: string | null, prefersLight = false) {
  const dataset: Record<string, string> = {};
  runInNewContext(THEME_BOOT_SCRIPT, {
    localStorage: { getItem: () => stored },
    window: { matchMedia: () => ({ matches: prefersLight }) },
    document: { documentElement: { dataset } },
  });
  return dataset;
}

test("boot script marks only valid stored themes as user choices", () => {
  assert.deepEqual(boot("light"), { theme: "light", themeSource: "user" });
  assert.deepEqual(boot("dark", true), { theme: "dark", themeSource: "user" });
  assert.deepEqual(boot("neon", true), { theme: "light" });
  assert.deepEqual(boot(null), { theme: "dark" });
  const throwing = {};
  runInNewContext(THEME_BOOT_SCRIPT, {
    localStorage: {
      getItem() {
        throw Error("blocked");
      },
    },
    window: { matchMedia: () => ({ matches: false }) },
    document: { documentElement: { dataset: throwing } },
  });
  assert.deepEqual(throwing, { theme: "dark" });
});

test("QR download blob is inert while the preview keeps the SVG type", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  const blobs = qrBlobs(svg);
  assert.equal(blobs.download.type, "application/octet-stream");
  assert.equal(blobs.preview.type, "image/svg+xml");
  assert.equal(await blobs.download.text(), svg);
});

test("re-entering a list disposed during an in-flight save resets busy and reloads", async () => {
  const calls: string[] = [];
  let release: (() => void) | undefined;
  const list = {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "General",
    version: 1,
    politicaRotacion: "SECUENCIAL" as const,
    creadoAt: "2026-06-01T00:00:00Z",
    canciones: [],
  };
  const model = new ListDraft(
    {
      async currentList() {
        calls.push("current");
        return list;
      },
      async listHistory() {
        calls.push("history");
        return [];
      },
      async publishList() {
        calls.push("publish");
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return list;
      },
    },
    list.id,
    true,
  );
  model.enter();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  model.pick({
    videoId: "abcdefghijk",
    titulo: "Tema",
    artista: "Artista",
    artistaVerificado: false,
    canal: "Canal",
    duracionSegundos: 200,
    miniaturaUrl: null,
  });
  const saving = model.publish();
  assert.equal(model.getSnapshot().busy, true);
  model.dispose();
  model.enter();
  assert.equal(model.getSnapshot().busy, true, "refresh starts immediately");
  for (let i = 0; i < 12; i++) await Promise.resolve();
  const state = model.getSnapshot();
  assert.equal(state.busy, false);
  assert.equal(state.uncertain, false);
  assert.deepEqual(calls, [
    "current",
    "history",
    "publish",
    "current",
    "history",
  ]);
  release?.();
  await saving;
  model.dispose();
});

test("unavailable songs get their own owner message", () => {
  assert.equal(
    ownerError("Una canción no está disponible en el catálogo."),
    "Esa canción no está disponible en el catálogo. Prueba con otra.",
  );
  assert.equal(
    ownerError("El proveedor del catálogo no está disponible."),
    "No pudimos buscar canciones ahora. Intenta de nuevo en unos minutos.",
  );
});

test("toast actions dedupe, cap at three and dismiss by id", () => {
  let list: { id: number; text: string }[] = [];
  const actions = createToastActions((update) => {
    list = update(list);
  });
  actions.notify("");
  for (const text of ["Uno", "Dos", "Uno", "Tres", "Cuatro"])
    actions.notify(text);
  assert.deepEqual(
    list.map((toast) => toast.text),
    ["Uno", "Tres", "Cuatro"],
  );
  actions.dismiss(list[0].id);
  assert.deepEqual(
    list.map((toast) => toast.text),
    ["Tres", "Cuatro"],
  );
});

test("following the device theme stays reachable at every width", () => {
  const html = renderToStaticMarkup(createElement(ThemeControls));
  const button =
    /<button[^>]*aria-label="Seguir el tema del dispositivo"[^>]*>/.exec(html);
  assert.ok(button);
  assert.doesNotMatch(button[0], /hide-(xs|sm)/);
  assert.match(button[0], /aria-pressed="true"/);
});

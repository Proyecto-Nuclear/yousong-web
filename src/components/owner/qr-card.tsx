"use client";

import { useEffect, useState } from "react";
import type { Qr } from "../../lib/admin-api";
import { DownloadIcon, ExternalIcon } from "../icons";

function loopback(url: string) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function QrCard({ qr }: { qr: Qr }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(
      new Blob([qr.svg], { type: "image/svg+xml" }),
    );
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [qr]);
  return (
    <div className="qr-card">
      <div className="qr-plate">
        {source ? (
          <>
            {/* SVG is isolated in image context, never inserted as HTML. */}
            {/* biome-ignore lint/performance/noImgElement: API SVG blob must not use the image optimizer. */}
            <img
              src={source}
              alt="Código QR para unirse a la sesión del local"
              width={200}
              height={200}
              referrerPolicy="no-referrer"
            />
          </>
        ) : (
          <span className="qr-plate__placeholder" />
        )}
      </div>
      <p className="qr-card__text">
        Quien lo escanee con la cámara del celular entra a la sesión de esta
        noche. Solo acepta pedidos mientras la sesión está abierta.
      </p>
      {loopback(qr.url) && (
        <p className="status-line">
          Este enlace usa la dirección de este computador: solo funciona aquí.
        </p>
      )}
      <div className="cluster cluster--center">
        {source && (
          <a className="btn" href={source} download="yousong-qr.svg">
            <DownloadIcon size={20} />
            Descargar QR
          </a>
        )}
        <a
          className="btn btn--ghost"
          href={qr.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalIcon size={20} />
          Abrir enlace de acceso
        </a>
      </div>
    </div>
  );
}

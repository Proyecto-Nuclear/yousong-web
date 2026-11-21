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

/**
 * The preview keeps the SVG type because <img> never runs SVG scripts. The
 * download blob is octet-stream so opening its blob: URL in this origin can
 * never render (and execute) the server-provided SVG as a document.
 */
export function qrBlobs(svg: string) {
  return {
    preview: new Blob([svg], { type: "image/svg+xml" }),
    download: new Blob([svg], { type: "application/octet-stream" }),
  };
}

export function QrCard({ qr }: { qr: Qr }) {
  const [source, setSource] = useState("");
  const [download, setDownload] = useState("");
  useEffect(() => {
    const blobs = qrBlobs(qr.svg);
    const preview = URL.createObjectURL(blobs.preview);
    const file = URL.createObjectURL(blobs.download);
    setSource(preview);
    setDownload(file);
    return () => {
      URL.revokeObjectURL(preview);
      URL.revokeObjectURL(file);
    };
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
              alt="Código QR para unirse a la noche del local"
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
        Quien lo escanee con la cámara del celular entra a la noche de hoy. Solo
        acepta pedidos mientras la noche está abierta.
      </p>
      {loopback(qr.url) && (
        <p className="status-line">
          Este enlace usa la dirección de este computador: solo funciona aquí.
        </p>
      )}
      <div className="cluster cluster--center">
        {download && (
          <a className="btn" href={download} download="yousong-qr.svg">
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

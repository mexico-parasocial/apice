"use client";

import { useEffect, useState } from "react";
import { initStreamplaceSession } from "@/app/utils/streamplaceOAuth";

export default function OAuthCallbackPage() {
  const [status, setStatus] = useState("Procesando inicio de sesión con Bluesky...");

  useEffect(() => {
    initStreamplaceSession()
      .then((result) => {
        if (result?.session) {
          setStatus(`Sesión iniciada como ${result.session.sub}. Cerrando...`);
          if (window.opener && window.opener !== window) {
            window.opener.postMessage(
              { type: "streamplace-oauth-callback", did: result.session.sub },
              window.location.origin
            );
            window.close();
          } else {
            window.location.href = "/admin";
          }
        } else {
          setStatus("No se encontró sesión. Redirigiendo...");
          setTimeout(() => {
            window.location.href = "/admin";
          }, 1500);
        }
      })
      .catch((err: unknown) => {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p>{status}</p>
    </div>
  );
}

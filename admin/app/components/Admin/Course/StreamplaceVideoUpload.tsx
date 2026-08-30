"use client";

import React, { FC, useCallback, useEffect, useRef, useState } from "react";
import type { OAuthSession } from "@atproto/oauth-client-browser";
import { toast } from "react-hot-toast";
import Cookies from "js-cookie";
import { styles } from "@/app/styles/style";
import {
  getStreamplaceOAuthClient,
  initStreamplaceSession,
} from "@/app/utils/streamplaceOAuth";
import {
  createUpload,
  publishVideo,
  uploadFileWithTus,
  waitForUploadDone,
} from "@/app/utils/streamplaceUpload";

type Props = {
  lessonId?: string;
  lessonTitle?: string;
  onLinked: (atUri: string, durationSeconds?: number) => void;
};

type Stage =
  | "idle" // no session
  | "ready" // session, waiting for file
  | "uploading"
  | "processing"
  | "publishing"
  | "done";

const StreamplaceVideoUpload: FC<Props> = ({
  lessonId,
  lessonTitle,
  onLinked,
}) => {
  const [stage, setStage] = useState<Stage>("idle");
  const [session, setSession] = useState<OAuthSession | null>(null);
  const [handle, setHandle] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(lessonTitle ?? "");
  const [description, setDescription] = useState("");
  const [uploadPct, setUploadPct] = useState(0);
  const [processPct, setProcessPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Restore an existing OAuth session on mount.
  useEffect(() => {
    initStreamplaceSession()
      .then((result) => {
        if (result?.session) {
          setSession(result.session);
          setStage("ready");
        }
      })
      .catch(() => {
        /* no stored session — stay in idle */
      });
  }, []);

  useEffect(() => {
    if (!title && lessonTitle) setTitle(lessonTitle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonTitle]);

  const handleConnect = useCallback(async () => {
    if (!handle.trim()) {
      toast.error("Ingresa tu handle de Bluesky (ej. usuario.bsky.social)");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const client = await getStreamplaceOAuthClient();
      const newSession = await client.signInPopup(handle.trim());
      setSession(newSession);
      setStage("ready");
      toast.success(`Conectado como ${newSession.sub}`);
    } catch (err: any) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "Inicio de sesión cancelado"
          : err?.message || "No se pudo iniciar sesión. ¿El popup fue bloqueado?";
      setError(message);
      toast.error(message);
    } finally {
      setConnecting(false);
    }
  }, [handle]);

  const linkToLesson = useCallback(
    async (atUri: string, durationSeconds?: number) => {
      if (!lessonId) return; // draft lesson — parent keeps the URI in state
      const accessToken = Cookies.get("accessToken");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/videos/lessons/${lessonId}/videoRef`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { "access-token": accessToken } : {}),
          },
          credentials: "include",
          body: JSON.stringify({ videoUrl: atUri, videoLength: durationSeconds }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "El video se publicó pero no se pudo vincular");
      }
    },
    [lessonId]
  );

  const handleUpload = useCallback(async () => {
    if (!session || !file) return;
    if (!title.trim()) {
      toast.error("El video necesita un título");
      return;
    }

    abortRef.current = new AbortController();
    setError(null);

    try {
      // 1. create upload
      setStage("uploading");
      setUploadPct(0);
      const { uploadId, uploadUrl, uploadToken } = await createUpload(
        session,
        file
      );

      // 2. TUS upload
      await uploadFileWithTus(uploadUrl, uploadToken, file, setUploadPct);

      // 3. wait for processing
      setStage("processing");
      setProcessPct(0);
      const { durationMs } = await waitForUploadDone(
        session,
        uploadId,
        setProcessPct,
        abortRef.current.signal
      );
      const durationSeconds =
        typeof durationMs === "number" ? Math.round(durationMs / 1000) : undefined;

      // 4. publish record
      setStage("publishing");
      const { uri } = await publishVideo(session, uploadId, {
        title: title.trim(),
        description: description.trim() || undefined,
      });

      // 5. link to lesson + notify parent
      await linkToLesson(uri, durationSeconds);
      onLinked(uri, durationSeconds);
      setStage("done");
      toast.success("Video publicado y vinculado a la lección");
    } catch (err: any) {
      setError(err?.message || "Error durante la subida");
      toast.error(err?.message || "Error durante la subida");
      setStage("ready");
    }
  }, [session, file, title, description, linkToLesson, onLinked]);

  const busy =
    stage === "uploading" || stage === "processing" || stage === "publishing";

  // ─── Idle: connect with Bluesky ──────────────────────────────────────────
  if (stage === "idle") {
    return (
      <div className="mb-3 rounded border border-dashed border-gray-400 p-3">
        <label className={styles.label}>Subir video nuevo</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="tu-handle.bsky.social"
            className={`${styles.input} flex-1`}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
          <button
            type="button"
            disabled={connecting}
            onClick={handleConnect}
            className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {connecting ? "Conectando..." : "Conectar con Bluesky"}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        <p className="text-xs text-gray-500 mt-1">
          Se abrirá una ventana para autorizar con tu cuenta de Bluesky. El
          video se publicará bajo tu DID en el nodo de Ápice.
        </p>
      </div>
    );
  }

  // ─── Ready / uploading / processing / publishing / done ──────────────────
  return (
    <div className="mb-3 rounded border border-dashed border-gray-400 p-3">
      <label className={styles.label}>Subir video nuevo</label>

      <input
        type="file"
        accept="video/mp4,video/*"
        disabled={busy}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm mb-2"
      />

      <input
        type="text"
        placeholder="Título del video"
        className={`${styles.input} mb-2`}
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        placeholder="Descripción (opcional)"
        className={`${styles.input} mb-2`}
        rows={2}
        value={description}
        disabled={busy}
        onChange={(e) => setDescription(e.target.value)}
      />

      {stage === "uploading" && (
        <ProgressBar label={`Subiendo… ${uploadPct}%`} pct={uploadPct} />
      )}
      {stage === "processing" && (
        <ProgressBar
          label={`Procesando en el nodo… ${processPct}%`}
          pct={processPct}
        />
      )}
      {stage === "publishing" && (
        <p className="text-sm text-gray-600">Publicando registro…</p>
      )}
      {stage === "done" && (
        <p className="text-sm text-green-600 mb-2">
          ✅ Video publicado y vinculado.
        </p>
      )}
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {stage !== "done" && (
        <button
          type="button"
          disabled={!file || busy}
          onClick={handleUpload}
          className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50"
        >
          {busy ? "Trabajando…" : "Subir y publicar"}
        </button>
      )}
    </div>
  );
};

const ProgressBar: FC<{ label: string; pct: number }> = ({ label, pct }) => (
  <div className="mb-2">
    <p className="text-sm text-gray-600 mb-1">{label}</p>
    <div className="w-full bg-gray-200 rounded h-2">
      <div
        className="bg-blue-600 h-2 rounded transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  </div>
);

export default StreamplaceVideoUpload;

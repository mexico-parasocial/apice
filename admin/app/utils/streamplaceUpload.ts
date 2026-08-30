"use client";

import type { OAuthSession } from "@atproto/oauth-client-browser";
import * as tus from "tus-js-client";

/**
 * Direct browser upload flow for a self-hosted Streamplace node.
 *
 * Flow (per the place.stream.media lexicons):
 *   1. place.stream.media.createUpload  → { uploadId, uploadUrl, uploadToken }
 *   2. TUS resumable upload to uploadUrl (Bearer token, no DPoP on chunks)
 *   3. place.stream.media.getUploadStatus → poll until "done"
 *   4. place.stream.media.publishVideo    → { uri, cid } (AT URI for the lesson)
 *
 * XRPC calls go through the OAuth session's fetchHandler, which attaches the
 * DPoP-bound credentials. Passing an absolute URL works because fetchHandler
 * resolves `new URL(pathname, tokenSet.aud)` — absolute URLs win.
 */

export interface CreateUploadResult {
  uploadId: string;
  uploadUrl: string;
  uploadToken: string;
  expiresAt: string;
}

export interface PublishVideoResult {
  uri: string;
  cid: string;
}

function getNodeUrl(): string {
  const nodeUrl = process.env.NEXT_PUBLIC_STREAMPLACE_NODE_URL;
  if (!nodeUrl) {
    throw new Error("NEXT_PUBLIC_STREAMPLACE_NODE_URL no está configurado");
  }
  return nodeUrl.replace(/\/$/, "");
}

async function xrpc<T>(
  session: OAuthSession,
  method: string,
  options?: { params?: Record<string, string>; body?: unknown }
): Promise<T> {
  const url = new URL(`${getNodeUrl()}/xrpc/${method}`);
  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await session.fetchHandler(url.toString(), {
    method: options?.body ? "POST" : "GET",
    ...(options?.body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body),
        }
      : {}),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(
      data?.message || data?.error || `Error del nodo Streamplace (${res.status})`
    );
  }
  return data as T;
}

/** Step 1 — register the upload and get a TUS endpoint + bearer token. */
export function createUpload(
  session: OAuthSession,
  file: File
): Promise<CreateUploadResult> {
  return xrpc<CreateUploadResult>(session, "place.stream.media.createUpload", {
    body: {
      size: file.size,
      mimeType: file.type || "video/mp4",
      filename: file.name,
    },
  });
}

/** Step 2 — TUS resumable upload. Bearer token only; no DPoP on chunks. */
export function uploadFileWithTus(
  uploadUrl: string,
  uploadToken: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      uploadUrl,
      headers: { Authorization: `Bearer ${uploadToken}` },
      chunkSize: 10 * 1024 * 1024, // 10 MB
      retryDelays: [0, 1000, 3000, 5000, 10000],
      metadata: { filename: file.name, filetype: file.type },
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: () => resolve(),
      onError: (error) =>
        reject(new Error(`Error subiendo el video: ${error.message}`)),
    });
    upload.start();
  });
}

interface UploadStatus {
  status: "pending" | "processing" | "done" | "error";
  progress?: number;
  durationMs?: number;
  error?: string;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/** Step 3 — poll processing status until the node finishes transcoding. */
export async function waitForUploadDone(
  session: OAuthSession,
  uploadId: string,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<{ durationMs?: number }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  for (;;) {
    if (signal?.aborted) throw new Error("Subida cancelada");
    if (Date.now() > deadline) {
      throw new Error("El procesamiento del video tardó demasiado");
    }

    const status = await xrpc<UploadStatus>(
      session,
      "place.stream.media.getUploadStatus",
      { params: { uploadId } }
    );

    if (status.status === "done") {
      return { durationMs: status.durationMs };
    }
    if (status.status === "error") {
      throw new Error(status.error || "El nodo no pudo procesar el video");
    }
    if (typeof status.progress === "number") {
      onProgress?.(status.progress);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/** Step 4 — publish the place.stream.video record; returns its AT URI. */
export function publishVideo(
  session: OAuthSession,
  uploadId: string,
  input: { title: string; description?: string }
): Promise<PublishVideoResult> {
  return xrpc<PublishVideoResult>(session, "place.stream.media.publishVideo", {
    body: {
      uploadId,
      record: {
        $type: "place.stream.video",
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        createdAt: new Date().toISOString(),
      },
    },
  });
}

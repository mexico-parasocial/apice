/**
 * Checks a video file before the (long) upload starts, so a bad file fails in
 * a second instead of after twenty minutes.
 *
 * Errors block the upload. Warnings don't: the browser can't decode every
 * codec the node can transcode, and the audience is on prepaid data, so the
 * advice matters more than a hard gate (docs/VIDEO_ENCODING.md).
 */

export interface VideoFacts {
  name: string;
  size: number;
  type: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
}

export interface Preflight {
  errors: string[];
  warnings: string[];
  /** e.g. "3:20 · 1080×1920 · 120 MB · 4.8 Mbps" */
  summary: string;
}

/** Hard cap on the file the admin can send. Overridable per deployment. */
export const DEFAULT_MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

/** docs/VIDEO_ENCODING.md targets ~1.5 Mbps; warn well above it. */
export const WARN_ABOVE_MBPS = 3;

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|avi|mpe?g|3gp|ogv)$/i;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function assessVideo(
  facts: VideoFacts,
  maxBytes: number = DEFAULT_MAX_VIDEO_BYTES
): Preflight {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { size, type, name, durationSeconds, width, height } = facts;

  if (size <= 0) {
    errors.push("El archivo está vacío.");
  } else if (size > maxBytes) {
    errors.push(
      `Pesa ${formatBytes(size)} y el máximo es ${formatBytes(maxBytes)}. Comprímelo antes de subirlo.`
    );
  }

  // Some browsers leave `type` empty for .mkv/.mov, so fall back to the name.
  const looksLikeVideo = type ? type.startsWith("video/") : VIDEO_EXTENSIONS.test(name);
  if (!looksLikeVideo) {
    errors.push("No parece un archivo de video. Usa MP4, MOV o WebM.");
  }

  const hasDuration =
    typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0;
  let mbps: number | undefined;

  if (hasDuration) {
    mbps = (size * 8) / durationSeconds! / 1_000_000;
    if (durationSeconds! < 1) {
      warnings.push("El video dura menos de un segundo. ¿Es el archivo correcto?");
    }
    if (mbps > WARN_ABOVE_MBPS) {
      warnings.push(
        `Bitrate de ${mbps.toFixed(1)} Mbps: pesa mucho para alumnos con datos prepago. ` +
          `Lo recomendado son ~1.5 Mbps (./scripts/prepare-lesson-video.sh).`
      );
    }
  } else if (errors.length === 0) {
    warnings.push(
      "El navegador no pudo leer la duración (¿códec no compatible?). Puedes subirlo: el nodo intentará procesarlo."
    );
  }

  const summary = [
    hasDuration ? formatDuration(durationSeconds!) : null,
    width && height ? `${width}×${height}` : null,
    size > 0 ? formatBytes(size) : null,
    mbps !== undefined ? `${mbps.toFixed(1)} Mbps` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return { errors, warnings, summary };
}

/**
 * Reads duration and dimensions with a throwaway <video> element. Resolves
 * with whatever it could get (possibly nothing) — never rejects, so an
 * unsupported codec degrades to a warning instead of blocking the upload.
 */
export function readVideoMetadata(
  file: File,
  timeoutMs = 8000
): Promise<Pick<VideoFacts, "durationSeconds" | "width" | "height">> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const finish = (result: Pick<VideoFacts, "durationSeconds" | "width" | "height">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(() => finish({}), timeoutMs);
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      finish({
        durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
      });
    video.onerror = () => finish({});
    video.src = url;
  });
}

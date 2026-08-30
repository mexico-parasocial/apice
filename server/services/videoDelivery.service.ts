import axios from "axios";
import { metrics } from "../utils/metrics";
import { log } from "../utils/logger";

const videoLog = log("video");

export interface ResolveOptions {
  /** Resume offset — uses Streamplace's nanosecond clip parameter. */
  startSeconds?: number;
}

/** Playback check outcome — modelled on atproto's job-status contract. */
export type PlaybackCheck = { ready: true } | { ready: false; error: string };

export interface VideoDeliveryProvider {
  name: string;
  resolvePlaybackUrl(
    videoRef: string,
    options?: ResolveOptions
  ): Promise<{
    playbackUrl: string;
    provider: string;
    expiresAt?: Date;
  }>;
  /** Verifies the reference is actually servable right now. */
  checkPlaybackUrl(videoRef: string): Promise<PlaybackCheck>;
}

/**
 * Resolves ATProto video records through Streamplace's VOD XRPC endpoint.
 *
 * Endpoint contract:
 *   GET https://stream.place/xrpc/place.stream.playback.getVideoPlaylist?uri=<at-uri>
 *
 * Note: vod-beta.stream.place is an outdated deployment; use the production
 * stream.place endpoint. Both `place.stream.media.defs#sourceTracks` and
 * `#sourceClip` records are playable there.
 */
export class StreamplaceProvider implements VideoDeliveryProvider {
  name = "streamplace";
  private baseUrl: string;

  constructor(baseUrl = "https://stream.place") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private playlistUrl(videoRef: string, params: Record<string, string>) {
    const url = `${this.baseUrl}/xrpc/place.stream.playback.getVideoPlaylist`;
    const query = new URLSearchParams({ uri: videoRef, ...params }).toString();
    return `${url}?${query}`;
  }

  /**
   * Verifies Streamplace can serve the playlist for this AT URI.
   *
   * A non-2xx here means the video was never published, was deleted, or the
   * URI is malformed — the lesson would 404 for every learner who opens it.
   * Checking at attach time turns that into an admin-facing error instead of
   * a support ticket three days later.
   */
  async checkPlaybackUrl(videoRef: string): Promise<PlaybackCheck> {
    if (!videoRef.startsWith("at://")) {
      return { ready: false, error: "Streamplace requires an AT URI video reference" };
    }
    try {
      const response = await axios.get(
        this.playlistUrl(videoRef, {}),
        // Read the status instead of throwing, so a 404 can be reported as
        // "not published" rather than an opaque axios error.
        { timeout: 15000, responseType: "text", validateStatus: () => true }
      );
      if (response.status >= 200 && response.status < 300) {
        return { ready: true };
      }
      return {
        ready: false,
        error: `Streamplace returned ${response.status} for this video — it may not be published yet`,
      };
    } catch (error: any) {
      return {
        ready: false,
        error: error?.message ?? "Streamplace is unreachable",
      };
    }
  }

  async resolvePlaybackUrl(videoRef: string, options?: ResolveOptions) {
    if (!videoRef.startsWith("at://")) {
      throw new Error("Streamplace requires an AT URI video reference");
    }

    // Resume: Streamplace accepts nanosecond start/end clip params on any
    // playlist request (same mechanism as clips).
    const params: Record<string, string> = {};
    if (options?.startSeconds && options.startSeconds > 0) {
      params.start = String(Math.floor(options.startSeconds * 1e9));
    }

    await axios.get(this.playlistUrl(videoRef, params), {
      timeout: 15000,
      responseType: "text",
    });

    // The response is an HLS playlist (m3u8). We return the same URL so the
    // client can stream it directly. If Streamplace ever returns a signed
    // redirect, we can follow it here.
    return {
      playbackUrl: this.playlistUrl(videoRef, params),
      provider: this.name,
    };
  }
}

/**
 * Serves a video straight from an http(s) URL — a locally hosted fixture, or
 * any static origin.
 *
 * Demo/dev only. There is no signing, no expiry and no per-viewer access
 * control beyond the caller's own auth, so it stays behind
 * ALLOW_DIRECT_VIDEO_URLS and must never be enabled in production, where
 * Streamplace AT URIs are the only supported reference.
 */
export class DirectUrlProvider implements VideoDeliveryProvider {
  name = "direct";

  async resolvePlaybackUrl(videoRef: string, options?: ResolveOptions) {
    // Progressive MP4 seeks client-side, so resume is a media fragment rather
    // than a server-side clip like Streamplace's nanosecond params.
    const playbackUrl =
      options?.startSeconds && options.startSeconds > 0
        ? `${videoRef}#t=${Math.floor(options.startSeconds)}`
        : videoRef;

    return { playbackUrl, provider: this.name };
  }

  async checkPlaybackUrl(videoRef: string): Promise<PlaybackCheck> {
    try {
      // HEAD, not GET: we only want existence, not the bytes.
      await axios.head(videoRef, {
        timeout: 10000,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return { ready: true };
    } catch {
      return { ready: false, error: "Video URL is not reachable" };
    }
  }
}

export function createVideoDeliveryProvider(videoRef: string): VideoDeliveryProvider {
  if (videoRef.startsWith("at://")) {
    return new StreamplaceProvider(process.env.STREAMPLACE_VOD_BASE_URL);
  }
  if (/^https?:\/\//i.test(videoRef)) {
    if (process.env.ALLOW_DIRECT_VIDEO_URLS !== "true") {
      throw new Error(
        "Direct video URLs are disabled. Set ALLOW_DIRECT_VIDEO_URLS=true for local demos."
      );
    }
    return new DirectUrlProvider();
  }
  throw new Error(
    "Unsupported video reference. Only at:// place.stream.video URIs are supported."
  );
}

/**
 * Resolves a playback URL with metrics attached.
 *
 * Counters and latency live here rather than in the controller so every
 * caller (playback endpoint, future embed views) is instrumented the same way.
 */
export async function resolvePlaybackUrlWithMetrics(
  videoRef: string,
  options?: ResolveOptions
) {
  const provider = createVideoDeliveryProvider(videoRef);
  const end = metrics.videoResolveDuration.startTimer({ provider: provider.name });
  try {
    const playback = await provider.resolvePlaybackUrl(videoRef, options);
    metrics.videoPlaybackRequests.inc({
      provider: provider.name,
      outcome: "success",
    });
    return playback;
  } catch (err) {
    metrics.videoPlaybackRequests.inc({
      provider: provider.name,
      outcome: "error",
    });
    videoLog.warn({ err, provider: provider.name }, "playback resolution failed");
    throw err;
  } finally {
    end();
  }
}

/**
 * Checks a video reference is servable before it is attached to a lesson.
 * Used by the admin "attach video" endpoint so an unpublished Streamplace
 * video fails there, not in front of a learner.
 */
export async function verifyVideoRef(videoRef: string): Promise<PlaybackCheck> {
  try {
    return await createVideoDeliveryProvider(videoRef).checkPlaybackUrl(videoRef);
  } catch (error: any) {
    return { ready: false, error: error?.message ?? "unsupported video reference" };
  }
}

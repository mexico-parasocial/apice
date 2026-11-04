import React, { FC, useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";

type Props = {
  videoUrl: string;
  title: string;
};

const STREAMPLACE_NODE_URL =
  process.env.NEXT_PUBLIC_STREAMPLACE_NODE_URL ?? "https://stream.place";

/**
 * Resolves a video reference to a playable URL.
 * - at:// place.stream.video records → HLS playlist via the Streamplace node
 * - http(s) URLs (mp4 / m3u8) → used as-is
 */
function resolvePlaybackUrl(videoUrl: string): string | null {
  if (!videoUrl) return null;
  if (videoUrl.startsWith("at://")) {
    return `${STREAMPLACE_NODE_URL}/xrpc/place.stream.playback.getVideoPlaylist?uri=${encodeURIComponent(
      videoUrl
    )}`;
  }
  if (videoUrl.startsWith("http://") || videoUrl.startsWith("https://")) {
    return videoUrl;
  }
  return null;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Lesson/course preview player with custom controls (scrubber, volume,
 * fullscreen, PiP) — inspired by bluesky-social's web-controls.
 */
const CoursePlayer: FC<Props> = ({ videoUrl, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const playbackUrl = resolvePlaybackUrl(videoUrl);

  useEffect(() => {
    setError(null);
    if (!playbackUrl || !videoRef.current) return;

    const video = videoRef.current;
    const isHls =
      playbackUrl.includes(".m3u8") || playbackUrl.includes("getVideoPlaylist");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError("No se pudo cargar el video.");
      });
      return () => hls.destroy();
    }

    video.src = playbackUrl;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }, [playbackUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onDuration = () => setDuration(video.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVolume = () => {
      setMuted(video.muted);
      setVolume(video.volume);
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDuration);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolume);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolume);
    };
  }, [playbackUrl]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(duration)) return;
      video.currentTime = Number(e.target.value);
    },
    [duration]
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, []);

  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Number(e.target.value);
    video.muted = false;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current as any;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      /* PiP unsupported — ignore */
    }
  }, []);

  if (!playbackUrl) {
    return (
      <div style={styles.placeholder}>
        {error ?? "Vista previa no disponible. Vincula un video at:// o una URL directa."}
      </div>
    );
  }

  const safeDuration = Number.isFinite(duration) ? duration : 0;

  return (
    <div ref={containerRef} style={styles.container}>
      <video
        ref={videoRef}
        title={title}
        style={styles.video}
        onClick={togglePlay}
        playsInline
      />

      <div style={styles.controls}>
        <button onClick={togglePlay} style={styles.button} aria-label={playing ? "Pausar" : "Reproducir"}>
          {playing ? "⏸" : "▶"}
        </button>

        <span style={styles.time}>
          {formatTime(currentTime)} / {formatTime(safeDuration)}
        </span>

        <div style={styles.scrubberWrap}>
          <div
            style={{
              ...styles.bufferedBar,
              width: safeDuration ? `${(buffered / safeDuration) * 100}%` : 0,
            }}
          />
          <input
            type="range"
            min={0}
            max={safeDuration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            style={styles.scrubber}
            aria-label="Buscar en el video"
          />
        </div>

        <button onClick={toggleMute} style={styles.button} aria-label={muted ? "Activar sonido" : "Silenciar"}>
          {muted || volume === 0 ? "🔇" : "🔊"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={handleVolume}
          style={styles.volume}
          aria-label="Volumen"
        />

        <button onClick={togglePip} style={styles.button} aria-label="Picture in picture">
          ⧉
        </button>
        <button onClick={toggleFullscreen} style={styles.button} aria-label="Pantalla completa">
          ⛶
        </button>
      </div>

      {error && <div style={styles.errorOverlay}>{error}</div>}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "relative",
    paddingTop: "56.25%",
    overflow: "hidden",
    background: "#000",
  },
  video: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
  },
  button: {
    background: "none",
    border: "none",
    color: "#fff",
    fontSize: 18,
    cursor: "pointer",
    padding: 4,
    lineHeight: 1,
  },
  time: {
    color: "#fff",
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  scrubberWrap: {
    position: "relative",
    flex: 1,
    display: "flex",
    alignItems: "center",
  },
  bufferedBar: {
    position: "absolute",
    height: 4,
    background: "rgba(255,255,255,0.35)",
    borderRadius: 2,
    pointerEvents: "none",
  },
  scrubber: {
    width: "100%",
    height: 4,
    appearance: "none",
    background: "transparent",
    cursor: "pointer",
  },
  volume: {
    width: 70,
    cursor: "pointer",
  },
  errorOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    background: "rgba(0,0,0,0.7)",
  },
  placeholder: {
    position: "relative",
    paddingTop: "56.25%",
    background: "#111",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};

export default CoursePlayer;

import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";

import { useVideoMuteState } from "./video/VideoVolumeContext";
import { useThrottledValue } from "./video/useThrottledValue";
import { useAutoplayDisabled } from "./video/useAutoplayDisabled";
import { TimeIndicator } from "./video/TimeIndicator";
import { MediaInsetBorder } from "./video/MediaInsetBorder";
import { VideoErrorBoundary } from "./video/VideoErrorBoundary";
import { AltBadgeWithDialog } from "./video/AltBadgeWithDialog";
import type { VideoPlayerProps } from "./VideoPlayer";

export type { VideoPlayerProps };

/**
 * Web lesson player.
 *
 * `@bsky.app/video`'s BlueskyVideoView throws "Not implemented on web", so the
 * web build uses a plain HTML5 <video> element and re-implements the same
 * callback contract (progress / end / startup / stall / error) that the native
 * player exposes. Platform split follows the same pattern as
 * ./utils/certificateDownload{,.native}.ts.
 *
 * Native controls are used rather than the custom poster/tap-to-play overlay:
 * on desktop the demo audience expects a scrubber, and browsers block
 * unmuted autoplay anyway.
 */
export function VideoPlayer(props: VideoPlayerProps) {
  return (
    <VideoErrorBoundary>
      <VideoPlayerInner {...props} />
    </VideoErrorBoundary>
  );
}

function VideoPlayerInner({
  uri,
  title,
  description,
  autoPlay = true,
  durationSeconds,
  onProgress,
  onEnd,
  onStartup,
  onStall,
  onPlaybackError,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useVideoMuteState();
  const autoplayDisabled = useAutoplayDisabled();

  const [isLoading, setIsLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endFiredRef = useRef(false);
  const startupFiredRef = useRef(false);
  const mountedAtRef = useRef(Date.now());
  const lastReportedRef = useRef(-1);

  const showSpinner = useThrottledValue(isLoading, 100);
  const shouldAutoplay = autoPlay && !autoplayDisabled;

  // Keep the shared mute state and the element in sync in both directions.
  useEffect(() => {
    const el = videoRef.current;
    if (el && el.muted !== muted) el.muted = muted;
  }, [muted]);

  if (error) {
    throw new Error(error);
  }

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el) return;

    // Prefer the element's real duration; fall back to the lesson's declared
    // length when metadata has not loaded yet.
    const duration = Number.isFinite(el.duration)
      ? el.duration
      : durationSeconds ?? 0;

    if (duration > 0) {
      setTimeRemaining(Math.max(0, duration - el.currentTime));
    }

    const elapsed = Math.floor(el.currentTime);
    if (onProgress && elapsed !== lastReportedRef.current) {
      lastReportedRef.current = elapsed;
      onProgress(elapsed);
    }
  };

  return (
    <View style={styles.container}>
      <video
        ref={videoRef}
        src={uri}
        controls
        playsInline
        autoPlay={shouldAutoplay}
        muted={muted}
        preload="metadata"
        aria-label={title ?? "Video de la lección"}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          backgroundColor: "#000",
        }}
        onWaiting={() => {
          onStall?.();
          setIsLoading(true);
        }}
        onCanPlay={() => setIsLoading(false)}
        onPlaying={() => {
          setIsLoading(false);
          setHasStarted(true);
          endFiredRef.current = false;
          if (!startupFiredRef.current) {
            startupFiredRef.current = true;
            onStartup?.(Date.now() - mountedAtRef.current);
          }
        }}
        onVolumeChange={() => {
          const el = videoRef.current;
          if (el && el.muted !== muted) setMuted(el.muted);
        }}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          if (!endFiredRef.current) {
            endFiredRef.current = true;
            onEnd?.();
          }
        }}
        onError={() => {
          onPlaybackError?.();
          setError("No se pudo reproducir el video de la lección.");
        }}
      />

      <MediaInsetBorder />

      {timeRemaining !== null && hasStarted && (
        <TimeIndicator timeRemaining={timeRemaining} />
      )}

      {description ? <AltBadgeWithDialog text={description} /> : null}

      {showSpinner && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

export function VideoPlayerSkeleton() {
  return (
    <View style={[styles.container, styles.skeleton]}>
      <ActivityIndicator size="large" color="#4A1052" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  skeleton: {
    backgroundColor: "#F4F4F4",
  },
});

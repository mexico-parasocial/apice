import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { BlueskyVideoView } from "@bsky.app/video";
import { Ionicons } from "@expo/vector-icons";

import { useVideoMuteState } from "./video/VideoVolumeContext";
import { useThrottledValue } from "./video/useThrottledValue";
import { useAutoplayDisabled } from "./video/useAutoplayDisabled";
import { KeepAwakeVideo } from "./video/KeepAwakeVideo";
import { TimeIndicator } from "./video/TimeIndicator";
import { MediaInsetBorder } from "./video/MediaInsetBorder";
import { VideoErrorBoundary } from "./video/VideoErrorBoundary";
import { AltBadgeWithDialog } from "./video/AltBadgeWithDialog";

export interface VideoPlayerProps {
  uri: string;
  title?: string;
  /** Used for the ALT dialog. */
  description?: string;
  autoPlay?: boolean;
  /** Lesson duration in seconds — used to derive watched progress. */
  durationSeconds?: number | null;
  /** Called with the watched position (seconds) as playback advances. */
  onProgress?: (seconds: number) => void;
  /** Called when playback reaches the end of the video. */
  onEnd?: () => void;
  /** Called once when the first frame starts (ms since mount). */
  onStartup?: (startupMs: number) => void;
  /** Called each time buffering starts (stall). */
  onStall?: () => void;
  /** Called when a playback error occurs. */
  onPlaybackError?: () => void;
}

/**
 * Native lesson player built on Bluesky's own video view (`@bsky.app/video`)
 * with the UX pattern set from bluesky-social/social-app's VideoEmbed:
 * global volume state, throttled spinner, time-remaining badge, inset border,
 * keep-awake, poster overlay, ALT dialog, error boundary with retry, and
 * reduce-motion autoplay respect. Single-active-video is enforced natively
 * by the module.
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
  const videoRef = useRef<BlueskyVideoView>(null);
  const [muted, setMuted] = useVideoMuteState();
  const autoplayDisabled = useAutoplayDisabled();

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endFiredRef = useRef(false);
  const mountedAtRef = useRef(Date.now());
  const startupFiredRef = useRef(false);

  // Only show a spinner when buffering lasts long enough to notice.
  const showSpinner = useThrottledValue(isLoading, 100);
  const shouldAutoplay = autoPlay && !autoplayDisabled;

  if (error) {
    throw new Error(error);
  }

  const togglePlayback = () => videoRef.current?.togglePlayback();
  const toggleMuted = () => videoRef.current?.toggleMuted();
  const enterFullscreen = () => videoRef.current?.enterFullscreen(false);

  // Brief center-icon pulse on tap-to-toggle, so the action registers even
  // when the frame itself doesn't change much (talking-head shots do this).
  const [tapFlash, setTapFlash] = useState<"play" | "pause" | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashToggle = React.useCallback(() => {
    setTapFlash(isPlaying ? "pause" : "play");
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setTapFlash(null), 450);
  }, [isPlaying]);

  React.useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    []
  );

  // Playback position for the progress strip. The module only reports
  // remaining time; the lesson's declared duration anchors the fraction.
  const elapsedSeconds =
    durationSeconds != null && timeRemaining != null
      ? Math.max(0, Math.min(durationSeconds, durationSeconds - timeRemaining))
      : null;
  const progressPct =
    durationSeconds && elapsedSeconds != null
      ? Math.min(100, Math.round((elapsedSeconds / durationSeconds) * 100))
      : 0;

  return (
    <View style={styles.container}>
      <BlueskyVideoView
        ref={videoRef}
        url={uri}
        autoplay={shouldAutoplay}
        beginMuted={muted}
        accessibilityLabel={title ?? "Video de la lección"}
        accessibilityHint="Reproduce el video de la lección"
        style={styles.video}
        onPlayerPress={togglePlayback}
        onActiveChange={(e) => setHasStarted((s) => s || e.nativeEvent.isActive)}
        onLoadingChange={(e) => {
          if (e.nativeEvent.isLoading && !isLoading) onStall?.();
          setIsLoading(e.nativeEvent.isLoading);
        }}
        onMutedChange={(e) => setMuted(e.nativeEvent.isMuted)}
        onStatusChange={(e) => {
          const playing = e.nativeEvent.status === "playing";
          setIsPlaying(playing);
          if (playing) {
            setHasStarted(true);
            endFiredRef.current = false;
            if (!startupFiredRef.current) {
              startupFiredRef.current = true;
              onStartup?.(Date.now() - mountedAtRef.current);
            }
          }
        }}
        onTimeRemainingChange={(e) => {
          const remaining = e.nativeEvent.timeRemaining;
          setTimeRemaining(remaining);
          if (durationSeconds && onProgress) {
            const elapsed = Math.max(0, durationSeconds - remaining);
            onProgress(Math.floor(elapsed));
          }
          if (remaining <= 1 && !endFiredRef.current) {
            endFiredRef.current = true;
            onEnd?.();
          }
        }}
        onError={(e) => {
          onPlaybackError?.();
          setError(e.nativeEvent.error);
        }}
      />

      <MediaInsetBorder />

      <KeepAwakeVideo isPlaying={isPlaying} />

      {/* iOS: BlueskyVideoView has no tap gesture (onPlayerPress is
          Android-only), so tap-to-pause/resume needs our own layer. */}
      {hasStarted && (
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={() => {
            togglePlayback();
            flashToggle();
          }}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pausar video" : "Reproducir video"}
        />
      )}

      {timeRemaining !== null && hasStarted && (
        <TimeIndicator timeRemaining={timeRemaining} />
      )}

      {/* Progress strip: elapsed chip + fill bar. Sits left of the remaining
          chip (absolute, bottom-right), all pointerEvents none so taps reach
          the play/pause layer underneath. */}
      {hasStarted && elapsedSeconds != null && (
        <View style={styles.bottomControls} pointerEvents="none">
          <View style={styles.timeChip}>
            <Text style={styles.timeText}>{formatClock(elapsedSeconds)}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
        </View>
      )}

      {tapFlash && (
        <View style={styles.flashOverlay} pointerEvents="none">
          <View style={styles.posterPlayCircle}>
            <Ionicons name={tapFlash} size={30} color="#FFFFFF" />
          </View>
        </View>
      )}

      {description ? <AltBadgeWithDialog text={description} /> : null}

      {showSpinner && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      )}

      {/* Paused mid-playback: the frozen frame alone gives no affordance, and
          on light frames a bare icon would vanish — dim + circle, as poster. */}
      {hasStarted && !isPlaying && (
        <TouchableOpacity
          style={styles.pausedOverlay}
          onPress={togglePlayback}
          accessibilityRole="button"
          accessibilityLabel={`Reanudar ${title ?? "video"}`}
        >
          <View style={styles.posterPlayCircle}>
            <Ionicons name="play" size={34} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      )}

      {!hasStarted && (
        <TouchableOpacity
          style={styles.poster}
          onPress={togglePlayback}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={`Reproducir ${title ?? "video"}`}
        >
          <View style={styles.posterPlayCircle}>
            <Ionicons name="play" size={34} color="#FFFFFF" />
          </View>
          {title ? (
            <Text style={styles.posterTitle} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
        </TouchableOpacity>
      )}

      <View style={styles.topRightControls}>
        <TouchableOpacity
          style={styles.chipButton}
          onPress={enterFullscreen}
          accessibilityRole="button"
          accessibilityLabel="Pantalla completa"
        >
          <Ionicons name="expand" size={15} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.chipButton}
          onPress={toggleMuted}
          accessibilityRole="button"
          accessibilityLabel={muted ? "Activar sonido" : "Silenciar"}
        >
          <Ionicons
            name={muted ? "volume-mute" : "volume-high"}
            size={15}
            color="#FFFFFF"
          />
        </TouchableOpacity>
      </View>
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

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    // White spinner needs a scrim to stay visible over light video frames.
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  bottomControls: {
    position: "absolute",
    left: 10,
    right: 72, // leaves room for the remaining-time chip (bottom-right)
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeChip: {
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Nunito_600SemiBold",
    fontVariant: ["tabular-nums"],
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
  },
  topRightControls: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    gap: 8,
  },
  chipButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    // Same chip recipe as TimeIndicator/ALT badge: white icon needs a dark
    // backing to read against arbitrary video content.
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  poster: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1F2937",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  posterPlayCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(74, 16, 82, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  posterTitle: {
    color: "#E5E7EB",
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    textAlign: "center",
  },
  skeleton: {
    backgroundColor: "#F4F4F4",
  },
});

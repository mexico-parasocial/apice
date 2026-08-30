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

      {timeRemaining !== null && hasStarted && (
        <TimeIndicator timeRemaining={timeRemaining} />
      )}

      {description ? <AltBadgeWithDialog text={description} /> : null}

      {showSpinner && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
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
  video: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
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

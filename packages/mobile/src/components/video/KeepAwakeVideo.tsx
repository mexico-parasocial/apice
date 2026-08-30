import { useEffect } from "react";
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from "expo-keep-awake";

const TAG = "apice-video";

/**
 * Keeps the screen on while a video is playing (Bluesky's KeepAwake pattern,
 * driven by playback status rather than mere component presence).
 */
export function KeepAwakeVideo({ isPlaying }: { isPlaying: boolean }) {
  useEffect(() => {
    if (isPlaying) {
      activateKeepAwakeAsync(TAG).catch(() => {});
      return () => {
        deactivateKeepAwake(TAG).catch(() => {});
      };
    }
  }, [isPlaying]);

  return null;
}

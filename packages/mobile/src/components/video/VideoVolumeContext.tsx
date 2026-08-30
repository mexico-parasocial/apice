import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Global video volume state (borrowed from Bluesky's VideoVolumeContext):
 * one mute/unmute preference shared by every player in the app, persisted
 * across sessions.
 */

const MUTE_KEY = "apice_video_muted";

type VideoVolumeContextValue = [boolean, (muted: boolean) => void];

const VideoVolumeContext = createContext<VideoVolumeContextValue>([
  false,
  () => {},
]);

export function VideoVolumeProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(MUTE_KEY).then((value) => {
      if (value !== null) setMutedState(value === "1");
    });
  }, []);

  const setMuted = (next: boolean) => {
    setMutedState(next);
    AsyncStorage.setItem(MUTE_KEY, next ? "1" : "0").catch(() => {});
  };

  return (
    <VideoVolumeContext.Provider value={[muted, setMuted]}>
      {children}
    </VideoVolumeContext.Provider>
  );
}

export function useVideoMuteState(): VideoVolumeContextValue {
  return useContext(VideoVolumeContext);
}

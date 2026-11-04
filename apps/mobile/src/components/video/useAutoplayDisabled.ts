import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Honors the OS reduce-motion accessibility setting: when enabled, videos
 * must not autoplay (Bluesky's useAutoplayDisabled).
 */
export function useAutoplayDisabled(): boolean {
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setDisabled);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setDisabled
    );
    return () => sub.remove();
  }, []);

  return disabled;
}

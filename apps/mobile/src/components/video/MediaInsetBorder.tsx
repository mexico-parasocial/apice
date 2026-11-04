import React from "react";
import { View, StyleSheet } from "react-native";

/**
 * Subtle inner border over media (Bluesky's MediaInsetBorder) — improves
 * legibility of light-colored videos on light backgrounds.
 */
export function MediaInsetBorder() {
  return <View style={styles.border} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  border: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.15)",
  },
});

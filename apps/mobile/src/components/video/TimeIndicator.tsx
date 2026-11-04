import React from "react";
import { View, Text, StyleSheet } from "react-native";

/**
 * Time-remaining badge shown over the player (Bluesky's TimeIndicator).
 */
export function TimeIndicator({ timeRemaining }: { timeRemaining: number }) {
  const total = Math.max(0, Math.round(timeRemaining));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const label = `-${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <View style={styles.badge} pointerEvents="none">
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    fontVariant: ["tabular-nums"],
  },
});

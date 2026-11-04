import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from "react-native";

export interface OptativeCourseCardProps {
  title: string;
  subtitle?: string;
  progress?: number; // 0–100
  color?: string;
  onPress?: () => void;
}

// Brand surfaces — deep Apice purple with gold reserved for progress,
// so "how far you are" is the one thing that glints on the card.
const CARD_PURPLE = "#4A1052";
const PROGRESS_GOLD = "#D4AF37";

export default function OptativeCourseCard({
  title,
  subtitle = "Optativo",
  progress = 0,
  color = CARD_PURPLE,
  onPress,
}: OptativeCourseCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[
        styles.container,
        { backgroundColor: color },
        isDark && styles.containerDark,
      ]}
    >
      <Text style={[styles.subtitle, { opacity: 0.9 }]}>{subtitle}</Text>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${clampedProgress}%` },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    minHeight: 140,
    justifyContent: "center",
    // iOS shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  containerDark: {
    shadowOpacity: 0.25,
  },
  subtitle: {
    color: "#E9D8A6",
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontFamily: "Raleway_700Bold",
    lineHeight: 28,
    marginBottom: 16,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: PROGRESS_GOLD,
    borderRadius: 3,
  },
});

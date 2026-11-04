import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from "react-native";

export interface OptativeModuleCardProps {
  number: number;
  title: string;
  color?: string;
  onPress?: () => void;
}

const CIRCLE_SIZE = 104;

/**
 * Circle node for the electives carousel. Ringed outline over a soft brand
 * tint (instead of a flat filled disc) so it reads as a waypoint on a path —
 * echoing the lesson road — rather than a button.
 */
export default function OptativeModuleCard({
  number,
  title,
  color,
  onPress,
}: OptativeModuleCardProps) {
  const isDark = useColorScheme() === "dark";

  const ring = color ?? (isDark ? "#A658BB" : "#4A1052");
  const fill = isDark ? "#2A082F" : "#F8F1FA";
  const numberColor = isDark ? "#E5CCEC" : "#4A1052";
  const titleColor = isDark ? "#D1D5DB" : "#4B5563";

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.container}
    >
      <View
        style={[
          styles.circle,
          {
            backgroundColor: fill,
            borderColor: ring,
            width: CIRCLE_SIZE,
            height: CIRCLE_SIZE,
            borderRadius: CIRCLE_SIZE / 2,
          },
        ]}
      >
        <Text style={[styles.number, { color: numberColor }]}>{number}</Text>
      </View>
      <Text style={[styles.title, { color: titleColor }]} numberOfLines={2}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CIRCLE_SIZE + 16,
    alignItems: "center",
    marginHorizontal: 8,
  },
  circle: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    shadowColor: "#4A1052",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 3,
  },
  number: {
    fontSize: 38,
    fontFamily: "Raleway_700Bold",
  },
  title: {
    marginTop: 10,
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
    textAlign: "center",
    lineHeight: 17,
  },
});

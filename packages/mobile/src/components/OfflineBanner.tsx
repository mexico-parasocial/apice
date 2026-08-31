import React from "react";
import { StyleSheet, Animated } from "react-native";
import { useNetInfo } from "../hooks/useNetInfo";
import { StatusBanner } from "./m8/StatusBanner";

/**
 * Animated banner that slides in from the top when the device goes offline.
 * Slides back out when connectivity returns.
 *
 * Uses the existing StatusBanner component for consistent styling.
 */
export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetInfo();
  const isOffline = !isConnected || isInternetReachable === false;
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(-60)).current;
  const [rendered, setRendered] = React.useState(false);

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: isOffline ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: isOffline ? 0 : -60,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (!isOffline) setRendered(false);
      else setRendered(true);
    });
  }, [isOffline, opacity, translateY]);

  if (!isOffline && !rendered) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity, transform: [{ translateY }] },
      ]}
      pointerEvents={isOffline ? "auto" : "none"}
    >
      <StatusBanner
        title="Sin conexión"
        detail="Algunos contenidos pueden no estar disponibles. Tu progreso se guardará localmente."
        tone="warning"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});

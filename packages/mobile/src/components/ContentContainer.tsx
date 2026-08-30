import React from "react";
import { View, StyleProp, ViewStyle } from "react-native";
import { useBreakpoint, CONTENT_MAX_WIDTH } from "../hooks/useBreakpoint";

export interface ContentContainerProps {
  children: React.ReactNode;
  /** Override the max width (e.g. a wide grid that can use more room). */
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Centers and caps content width on wide screens; a no-op on phones.
 *
 * Without this, every screen stretches edge-to-edge on a desktop monitor and
 * line lengths become unreadable — the single biggest tell that a web app is
 * really a phone app in a browser.
 */
export function ContentContainer({
  children,
  maxWidth = CONTENT_MAX_WIDTH,
  style,
}: ContentContainerProps) {
  const { isTablet } = useBreakpoint();

  if (!isTablet) return <>{children}</>;

  return (
    <View style={[{ width: "100%", maxWidth, alignSelf: "center" }, style]}>
      {children}
    </View>
  );
}

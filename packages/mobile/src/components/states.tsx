import React from "react";
import { View, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, atoms as a } from "../alf";
import { Text as AlfText } from "../alf/typography";

/**
 * Shared loading / error / empty states (alf-styled) — one consistent UX
 * across every screen instead of per-screen improvisation.
 */

export function LoadingState({ label }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={theme.palette.primary_800} />
      {label ? (
        <AlfText variant="caption" color="contrast_500" style={a.mt_md}>
          {label}
        </AlfText>
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.centered}>
      <Ionicons name="warning-outline" size={44} color="#E91646" />
      <AlfText variant="title" style={a.mt_md}>
        Algo salió mal
      </AlfText>
      <AlfText
        variant="body"
        color="contrast_500"
        style={[a.mt_xs, styles.message]}
      >
        {message}
      </AlfText>
      {onRetry ? (
        <TouchableOpacity
          style={[styles.retryButton, { borderColor: theme.palette.primary_800 }]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Reintentar"
        >
          <AlfText variant="button" color="primary_800">
            Reintentar
          </AlfText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon = "file-tray-outline",
  title,
  message,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.centered}>
      <Ionicons name={icon} size={44} color={theme.palette.contrast_300} />
      <AlfText variant="title" style={a.mt_md}>
        {title}
      </AlfText>
      {message ? (
        <AlfText
          variant="body"
          color="contrast_500"
          style={[a.mt_xs, styles.message]}
        >
          {message}
        </AlfText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  message: {
    textAlign: "center",
  },
  retryButton: {
    marginTop: 20,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
});

import React, { useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import {
  createThemes,
  DEFAULT_PALETTE,
  DEFAULT_SUBDUED_PALETTE,
  Provider as AlfProvider,
  useTheme,
  atoms,
  tokens,
} from "@bsky.app/alf";

/**
 * Ápice's alf layer (same architecture as bluesky-social/social-app):
 * the published @bsky.app/alf package provides atoms/tokens/theming engine;
 * we supply the Ápice palettes on top.
 *
 * Primary ramp: Ápice purple (#4A1052 family).
 */

const apiceLightPalette = {
  ...DEFAULT_PALETTE,
  primary_25: "#F8F1FA",
  primary_50: "#F1E3F5",
  primary_100: "#E5CCEC",
  primary_200: "#D4A9E0",
  primary_300: "#BE80CF",
  primary_400: "#A658BB",
  primary_500: "#8C3AA0",
  primary_600: "#722887",
  primary_700: "#5A1C6C",
  primary_800: "#4A1052",
  primary_900: "#3A0C41",
  primary_950: "#2A082F",
  primary_975: "#1E0622",
};

const apiceDarkPalette = {
  ...DEFAULT_SUBDUED_PALETTE,
  primary_25: "#1E0622",
  primary_50: "#2A082F",
  primary_100: "#3A0C41",
  primary_200: "#4A1052",
  primary_300: "#5A1C6C",
  primary_400: "#722887",
  primary_500: "#8C3AA0",
  primary_600: "#A658BB",
  primary_700: "#BE80CF",
  primary_800: "#D4A9E0",
  primary_900: "#E5CCEC",
  primary_950: "#F1E3F5",
  primary_975: "#F8F1FA",
};

const apiceThemes = createThemes({
  defaultPalette: apiceLightPalette,
  subduedPalette: apiceDarkPalette,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const activeTheme = scheme === "dark" ? "dark" : "light";

  const value = useMemo(
    () => ({
      activeTheme: activeTheme as "light" | "dark",
      themes: {
        light: apiceThemes.light,
        dark: apiceThemes.dark,
      },
    }),
    [activeTheme]
  );

  return (
    <AlfProvider activeTheme={value.activeTheme} themes={value.themes}>
      {children}
    </AlfProvider>
  );
}

export { useTheme, atoms, tokens, apiceThemes };

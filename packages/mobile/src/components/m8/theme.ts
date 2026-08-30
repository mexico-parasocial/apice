/**
 * Ápice-flavored token palette for the m8 primitive components.
 * Mirrors the shape of TH1/src/theme.ts so the vendored components work unchanged.
 */

export const palette = {
  background: "#FFFFFF",
  surface: "#F3F4F6",
  surfaceRaised: "#FFFFFF",
  surfaceSoft: "#F3F4F6",
  stroke: "#E5E7EB",
  text: "#111827",
  muted: "#6B7280",
  accent: "#4A1052",
  accentSoft: "#7C3A8A",
  onAccent: "#FFFFFF",
  success: "#09B35E",
  onSuccess: "#FFFFFF",
  warning: "#FACC15",
  onWarning: "#111827",
  danger: "#E91646",
  onDanger: "#FFFFFF",
};

export type ColorToken = keyof typeof palette;

export const tokens = {
  ...palette,
  accentTransparent: "rgba(74, 16, 82, 0.10)",
  accentBorder: "rgba(74, 16, 82, 0.20)",
  dangerTransparent: "rgba(233, 22, 70, 0.08)",
  dangerBorder: "rgba(233, 22, 70, 0.20)",
  warningTransparent: "rgba(250, 204, 21, 0.12)",
  warningBorder: "rgba(250, 204, 21, 0.20)",
  surfaceTransparent: "rgba(17, 24, 39, 0.045)",
  glassBg: "rgba(255, 255, 255, 0.72)",
  glassBorder: "rgba(17, 24, 39, 0.08)",
  glassBorderStrong: "rgba(17, 24, 39, 0.14)",
};

export type Token = keyof typeof tokens;

export const colors = tokens;

export const iosShadow = {
  shadowColor: "#000" as const,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.15,
  shadowRadius: 3,
  elevation: 3,
};

export function token(key: Token): string {
  return tokens[key];
}

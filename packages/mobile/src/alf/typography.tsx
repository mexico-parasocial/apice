import React from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { useTheme } from "./index";

/**
 * Ápice typography on top of alf. social-app uses react-native-uitextview
 * here; we keep plain RN Text (no extra native module) with our font stack:
 * wordmark = Montserrat, headings = Raleway_700Bold, body = Nunito.
 */

type Variant = "wordmark" | "heading" | "title" | "body" | "caption" | "button";

const VARIANTS: Record<Variant, object> = {
  // Brand face — reserved for the Ápice logotype, never for content headings.
  // The tighter tracking keeps the accented "Á" from drifting at display size.
  wordmark: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 30,
    letterSpacing: -0.5,
  },
  heading: { fontFamily: "Raleway_700Bold", fontSize: 28 },
  title: { fontFamily: "Raleway_700Bold", fontSize: 18 },
  body: { fontFamily: "Nunito_400Regular", fontSize: 15 },
  caption: { fontFamily: "Nunito_600SemiBold", fontSize: 12 },
  button: { fontFamily: "Nunito_700Bold", fontSize: 14 },
};

export interface TextProps extends RNTextProps {
  variant?: Variant;
  /** alf palette key, e.g. "primary_800", "contrast_600". */
  color?: string;
}

export function Text({ variant = "body", color, style, ...rest }: TextProps) {
  const theme = useTheme();
  const resolvedColor =
    (color && (theme.palette as Record<string, string>)[color]) ??
    theme.atoms.text.color;

  return (
    <RNText
      {...rest}
      style={[VARIANTS[variant], { color: resolvedColor }, style]}
    />
  );
}

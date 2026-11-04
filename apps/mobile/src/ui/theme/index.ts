export interface AppTheme {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    success: string;
    warning: string;
    danger: string;
  };
  fonts: {
    /** Brand face — the Ápice logotype only, not content headings. */
    wordmark: string;
    heading: string;
    body: string;
  };
  spacing: (n: number) => number;
}

export const baseTheme: AppTheme = {
  colors: {
    primary: "#4A1052",
    secondary: "#D4AF37",
    background: "#FFFFFF",
    surface: "#F3F4F6",
    text: "#111827",
    success: "#09B35E",
    warning: "#D4AF37",
    danger: "#E91646",
  },
  fonts: {
    wordmark: "Montserrat_800ExtraBold",
    heading: "Raleway_700Bold",
    body: "Nunito_400Regular",
  },
  spacing: (n) => n * 8,
};

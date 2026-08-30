export type OnboardingThemeMode = "light" | "dark" | "system";

export interface OnboardingTokens {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSoft: string;
  stroke: string;
  text: string;
  muted: string;
  accent: string;
  accentTransparent: string;
  onAccent: string;
  danger: string;
}

export interface OnboardingThemeApi {
  theme: OnboardingThemeMode;
  resolvedTheme: "light" | "dark";
  tokens: OnboardingTokens;
  setTheme: (theme: OnboardingThemeMode) => void;
}

export type OnboardingStep =
  | "theme"
  | "accessibility"
  | "learning-style"
  | "basic-data";

export interface OnboardingProfile {
  theme: OnboardingThemeMode;
  accessibility: string | null;
  learningStyle: string | null;
  profile: {
    fullName: string;
    email: string;
    birthDate: string;
    gender: string | null;
    state: string | null;
  };
}

export interface OnboardingState {
  activeStep: OnboardingStep;
  stepTransitionDirection: "forward" | "backward";
  data: OnboardingProfile;
}

export type OnboardingAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "setData"; data: Partial<OnboardingProfile> }
  | { type: "reset" };

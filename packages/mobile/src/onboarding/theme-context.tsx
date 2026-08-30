import { createContext, useContext } from "react";
import type { OnboardingThemeApi } from "./types";

export const OnboardingThemeContext = createContext<OnboardingThemeApi | null>(
  null
);

export const OnboardingThemeProvider = OnboardingThemeContext.Provider;

export function useOnboardingTheme(): OnboardingThemeApi {
  const ctx = useContext(OnboardingThemeContext);
  if (!ctx) {
    throw new Error(
      "useOnboardingTheme must be used within an OnboardingThemeProvider"
    );
  }
  return ctx;
}

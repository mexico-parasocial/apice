import { createContext, useContext } from "react";
import type { OnboardingProfile } from "./types";

export interface OnboardingCallbacks {
  onComplete: (profile: OnboardingProfile) => void | Promise<void>;
  onClose?: () => void;
}

export const OnboardingCallbacksContext = createContext<OnboardingCallbacks | null>(
  null
);

export const OnboardingCallbacksProvider = OnboardingCallbacksContext.Provider;

export function useOnboardingCallbacks(): OnboardingCallbacks {
  const ctx = useContext(OnboardingCallbacksContext);
  if (!ctx) {
    throw new Error(
      "useOnboardingCallbacks must be used within an OnboardingCallbacksProvider"
    );
  }
  return ctx;
}

import { useReducer, useMemo } from "react";
import { View } from "react-native";
import type { OnboardingProfile, OnboardingThemeApi } from "./types";
import { OnboardingThemeProvider } from "./theme-context";
import { OnboardingCallbacksProvider } from "./callbacks-context";
import { OnboardingContext, reducer, createInitialOnboardingState } from "./state";
import Layout from "./Layout";
import StepTheme from "./steps/StepTheme";
import StepAccessibility from "./steps/StepAccessibility";
import StepLearningStyle from "./steps/StepLearningStyle";
import StepBasicData from "./steps/StepBasicData";

export interface InteractiveOnboardingProps {
  themeApi: OnboardingThemeApi;
  onComplete: (profile: OnboardingProfile) => void | Promise<void>;
  onClose?: () => void;
  initialData?: Partial<OnboardingProfile>;
}

export default function InteractiveOnboarding({
  themeApi,
  onComplete,
  onClose,
  initialData,
}: InteractiveOnboardingProps) {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => createInitialOnboardingState(initialData)
  );

  const contextValue = useMemo(
    () => ({ state, dispatch }),
    [state, dispatch]
  );

  const callbacksValue = useMemo(
    () => ({ onComplete, onClose }),
    [onComplete, onClose]
  );

  return (
    <OnboardingThemeProvider value={themeApi}>
      <OnboardingContext.Provider value={contextValue}>
        <OnboardingCallbacksProvider value={callbacksValue}>
          <View style={{ flex: 1, backgroundColor: themeApi.tokens.background }}>
            <Layout>
              {state.activeStep === "theme" && <StepTheme />}
              {state.activeStep === "accessibility" && <StepAccessibility />}
              {state.activeStep === "learning-style" && <StepLearningStyle />}
              {state.activeStep === "basic-data" && <StepBasicData />}
            </Layout>
          </View>
        </OnboardingCallbacksProvider>
      </OnboardingContext.Provider>
    </OnboardingThemeProvider>
  );
}

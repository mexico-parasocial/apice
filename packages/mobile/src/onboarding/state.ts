import { createContext, useContext, useMemo } from "react";
import type {
  OnboardingAction,
  OnboardingProfile,
  OnboardingState,
  OnboardingStep,
} from "./types";

const stepOrder: OnboardingStep[] = [
  "theme",
  "accessibility",
  "learning-style",
  "basic-data",
];

export function createInitialOnboardingState(
  initialData?: Partial<OnboardingProfile>
): OnboardingState {
  return {
    activeStep: "theme",
    stepTransitionDirection: "forward",
    data: {
      theme: "system",
      accessibility: null,
      learningStyle: null,
      profile: {
        fullName: "",
        email: "",
        birthDate: "",
        gender: null,
        state: null,
      },
      ...initialData,
    },
  };
}

export function reducer(
  state: OnboardingState,
  action: OnboardingAction
): OnboardingState {
  switch (action.type) {
    case "next": {
      const nextIndex = stepOrder.indexOf(state.activeStep) + 1;
      const nextStep = stepOrder[nextIndex];
      if (!nextStep) return state;
      return {
        ...state,
        activeStep: nextStep,
        stepTransitionDirection: "forward",
      };
    }
    case "prev": {
      const prevIndex = stepOrder.indexOf(state.activeStep) - 1;
      const prevStep = stepOrder[prevIndex];
      if (!prevStep) return state;
      return {
        ...state,
        activeStep: prevStep,
        stepTransitionDirection: "backward",
      };
    }
    case "setData":
      return {
        ...state,
        data: {
          ...state.data,
          ...action.data,
          profile: {
            ...state.data.profile,
            ...action.data.profile,
          },
        },
      };
    case "reset":
      return createInitialOnboardingState();
    default:
      return state;
  }
}

export const OnboardingContext = createContext<{
  state: OnboardingState;
  dispatch: React.Dispatch<OnboardingAction>;
} | null>(null);

export function useInteractiveOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error(
      "useInteractiveOnboarding must be used within an OnboardingContext.Provider"
    );
  }

  const { state, dispatch } = ctx;

  const derived = useMemo(() => {
    const activeStepIndex = stepOrder.indexOf(state.activeStep);
    return {
      ...state,
      activeStepIndex,
      totalSteps: stepOrder.length,
      canGoBack: activeStepIndex > 0,
      isLastStep: activeStepIndex === stepOrder.length - 1,
    };
  }, [state]);

  return { state: derived, dispatch };
}

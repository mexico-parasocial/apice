import type { ReactNode } from "react";
import { useRef, useEffect } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useOnboardingTheme } from "./theme-context";
import { useInteractiveOnboarding } from "./state";
import { useOnboardingCallbacks } from "./callbacks-context";

interface LayoutProps {
  children: ReactNode;
  footer?: ReactNode;
}

export default function Layout({ children, footer }: LayoutProps) {
  const { tokens } = useOnboardingTheme();
  const { state } = useInteractiveOnboarding();
  const { onClose } = useOnboardingCallbacks();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [state.activeStep]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    stepCounter: {
      fontSize: 14,
      color: tokens.muted,
      fontWeight: "600",
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.surfaceSoft,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 120,
    },
    footer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 32,
      backgroundColor: tokens.background,
      borderTopWidth: 1,
      borderTopColor: tokens.stroke,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.stepCounter}>
          Paso {state.activeStepIndex + 1} de {state.totalSteps}
        </Text>
        <TouchableOpacity
          style={styles.closeButton}
          accessibilityLabel="Cerrar"
          accessibilityRole="button"
          onPress={onClose}
        >
          <Ionicons name="close" size={24} color={tokens.text} />
        </TouchableOpacity>
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer && <View style={styles.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

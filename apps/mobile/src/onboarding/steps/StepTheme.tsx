import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OnboardingThemeMode } from "../types";
import { useOnboardingTheme } from "../theme-context";
import { useInteractiveOnboarding } from "../state";
import HighlightedTitle from "../components/HighlightedTitle";
import ContinueButton from "../components/ContinueButton";

const options: {
  value: OnboardingThemeMode;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    value: "light",
    label: "Claro",
    icon: "sunny-outline",
    description: "Fondo claro para leer con luz natural.",
  },
  {
    value: "dark",
    label: "Oscuro",
    icon: "moon-outline",
    description: "Fondo oscuro para reducir la fatiga visual.",
  },
  {
    value: "system",
    label: "Predeterminado del sistema",
    icon: "settings-outline",
    description: "Cambia automáticamente con tu dispositivo.",
  },
];

export default function StepTheme() {
  const { tokens, setTheme, theme } = useOnboardingTheme();
  const { state, dispatch } = useInteractiveOnboarding();

  const selected = state.data.theme;

  const handleSelect = (value: OnboardingThemeMode) => {
    setTheme(value);
    dispatch({ type: "setData", data: { theme: value } });
  };

  const handleContinue = () => {
    dispatch({ type: "next" });
  };

  const styles = StyleSheet.create({
    option: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: tokens.stroke,
      backgroundColor: tokens.surface,
      marginBottom: 12,
    },
    optionSelected: {
      borderColor: tokens.accent,
      backgroundColor: tokens.accentTransparent,
    },
    optionText: {
      flex: 1,
      marginLeft: 16,
    },
    optionLabel: {
      fontSize: 16,
      fontWeight: "700",
      color: tokens.text,
      marginBottom: 2,
    },
    optionDescription: {
      fontSize: 13,
      color: tokens.muted,
    },
  });

  return (
    <View>
      <HighlightedTitle highlights={["modo"]}>
        Elige el modo que te haga sentir más cómodo.
      </HighlightedTitle>

      {options.map((option) => {
        const isSelected = selected === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.option, isSelected && styles.optionSelected]}
            onPress={() => handleSelect(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option.label}
          >
            <Ionicons
              name={option.icon as any}
              size={28}
              color={isSelected ? tokens.accent : tokens.muted}
            />
            <View style={styles.optionText}>
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionDescription}>
                {option.description}
              </Text>
            </View>
            {isSelected && (
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={tokens.accent}
              />
            )}
          </TouchableOpacity>
        );
      })}

      <ContinueButton title="Continuar" onPress={handleContinue} />
    </View>
  );
}

import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { useOnboardingTheme } from "../theme-context";

interface ContinueButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}

export default function ContinueButton({
  title,
  onPress,
  disabled = false,
}: ContinueButtonProps) {
  const { tokens } = useOnboardingTheme();

  const styles = StyleSheet.create({
    button: {
      alignSelf: "center",
      paddingVertical: 14,
      paddingHorizontal: 32,
      borderRadius: 28,
      backgroundColor: disabled ? tokens.stroke : tokens.accent,
      opacity: disabled ? 0.6 : 1,
    },
    text: {
      fontSize: 18,
      fontWeight: "700",
      color: tokens.onAccent,
      textAlign: "center",
    },
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Text style={styles.text}>{title}</Text>
    </TouchableOpacity>
  );
}

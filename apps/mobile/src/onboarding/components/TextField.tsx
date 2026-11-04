import { View, TextInput, Text, StyleSheet } from "react-native";
import { useOnboardingTheme } from "../theme-context";

interface TextFieldProps {
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "email-address" | "numeric";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  secureTextEntry?: boolean;
  label?: string;
  error?: string;
}

export default function TextField({
  placeholder,
  value,
  onChangeText,
  keyboardType = "default",
  autoCapitalize = "none",
  secureTextEntry = false,
  label,
  error,
}: TextFieldProps) {
  const { tokens } = useOnboardingTheme();

  const styles = StyleSheet.create({
    container: {
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: tokens.muted,
      marginBottom: 8,
      marginLeft: 4,
    },
    input: {
      height: 56,
      backgroundColor: tokens.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: error ? tokens.danger : tokens.stroke,
      paddingHorizontal: 20,
      fontSize: 16,
      color: tokens.text,
    },
    errorText: {
      color: tokens.danger,
      fontSize: 12,
      marginTop: 4,
      marginLeft: 8,
    },
  });

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={tokens.muted}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

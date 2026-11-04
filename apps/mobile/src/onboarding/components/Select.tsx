import { View, Text, StyleSheet } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useOnboardingTheme } from "../theme-context";

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  placeholder: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string | null) => void;
  label?: string;
}

export default function Select({
  placeholder,
  value,
  options,
  onChange,
  label,
}: SelectProps) {
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
    wrapper: {
      backgroundColor: tokens.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: tokens.stroke,
      overflow: "hidden",
    },
    picker: {
      height: 56,
      color: value ? tokens.text : tokens.muted,
    },
  });

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.wrapper}>
        <Picker
          selectedValue={value ?? ""}
          onValueChange={(itemValue) => {
            onChange(itemValue === "" ? null : itemValue);
          }}
          style={styles.picker}
          dropdownIconColor={tokens.muted}
        >
          <Picker.Item label={placeholder} value="" color={tokens.muted} />
          {options.map((option) => (
            <Picker.Item
              key={option.value}
              label={option.label}
              value={option.value}
              color={tokens.text}
            />
          ))}
        </Picker>
      </View>
    </View>
  );
}

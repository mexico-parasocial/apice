import { View } from "react-native";
import { useState } from "react";
import { useInteractiveOnboarding } from "../state";
import HighlightedTitle from "../components/HighlightedTitle";
import Select from "../components/Select";
import ContinueButton from "../components/ContinueButton";

const accessibilityOptions = [
  { label: "Ninguna", value: "none" },
  { label: "Visual", value: "visual" },
  { label: "Auditiva", value: "auditory" },
  { label: "Motora", value: "motor" },
  { label: "Cognitiva", value: "cognitive" },
  { label: "Otra", value: "other" },
];

export default function StepAccessibility() {
  const { state, dispatch } = useInteractiveOnboarding();
  const [value, setValue] = useState<string | null>(state.data.accessibility);

  const handleContinue = () => {
    dispatch({ type: "setData", data: { accessibility: value } });
    dispatch({ type: "next" });
  };

  return (
    <View>
      <HighlightedTitle highlights={["discapacidad", "accesibilidad", "mejorar"]}>
        ¿Tienes alguna discapacidad o necesidad de accesibilidad que debamos
        considerar para mejorar tu aprendizaje?
      </HighlightedTitle>

      <Select
        placeholder="Elige"
        value={value}
        options={accessibilityOptions}
        onChange={setValue}
      />

      <ContinueButton
        title="Continuar"
        onPress={handleContinue}
        disabled={!value}
      />
    </View>
  );
}

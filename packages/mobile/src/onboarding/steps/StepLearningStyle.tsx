import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from "react-native";
import { useState } from "react";
import { useOnboardingTheme } from "../theme-context";
import { useInteractiveOnboarding } from "../state";
import HighlightedTitle from "../components/HighlightedTitle";
import Select from "../components/Select";
import ContinueButton from "../components/ContinueButton";

const learningStyleOptions = [
  { label: "Visual", value: "visual" },
  { label: "Auditivo", value: "auditory" },
  { label: "Kinestésico", value: "kinesthetic" },
  { label: "Lectura/Escritura", value: "reading-writing" },
  { label: "Social", value: "social" },
  { label: "Solitario", value: "solitary" },
];

export default function StepLearningStyle() {
  const { tokens } = useOnboardingTheme();
  const { state, dispatch } = useInteractiveOnboarding();
  const [value, setValue] = useState<string | null>(state.data.learningStyle);
  const [showInfo, setShowInfo] = useState(false);

  const handleContinue = () => {
    dispatch({ type: "setData", data: { learningStyle: value } });
    dispatch({ type: "next" });
  };

  const styles = StyleSheet.create({
    linkRow: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: 8,
      marginBottom: 24,
    },
    linkText: {
      fontSize: 14,
      color: tokens.text,
    },
    linkAction: {
      fontSize: 14,
      color: tokens.accent,
      fontWeight: "700",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    modalCard: {
      backgroundColor: tokens.surface,
      borderRadius: 24,
      padding: 24,
      width: "100%",
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: tokens.text,
      marginBottom: 12,
    },
    modalText: {
      fontSize: 15,
      color: tokens.muted,
      lineHeight: 22,
      marginBottom: 20,
    },
    modalButton: {
      backgroundColor: tokens.accent,
      borderRadius: 16,
      paddingVertical: 12,
      alignItems: "center",
    },
    modalButtonText: {
      color: tokens.onAccent,
      fontWeight: "700",
      fontSize: 16,
    },
  });

  return (
    <View>
      <HighlightedTitle
        highlights={["accesible", "cómo", "aprendes", "mejor"]}
      >
        Queremos que tu formación sea plenamente accesible; cuéntanos cómo
        aprendes mejor.
      </HighlightedTitle>

      <Select
        placeholder="Estilo de aprendizaje"
        value={value}
        options={learningStyleOptions}
        onChange={setValue}
      />

      <View style={styles.linkRow}>
        <Text style={styles.linkText}>¿No sabes tu estilo? </Text>
        <TouchableOpacity onPress={() => setShowInfo(true)}>
          <Text style={styles.linkAction}>Descúbrelo.</Text>
        </TouchableOpacity>
      </View>

      <ContinueButton
        title="Finalizar"
        onPress={handleContinue}
        disabled={!value}
      />

      <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfo(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Estilos de aprendizaje</Text>
            <Text style={styles.modalText}>
              Cada persona aprende de forma diferente. Elige el estilo que más
              se acerque a cómo prefieres absorber nueva información.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowInfo(false)}
            >
              <Text style={styles.modalButtonText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
